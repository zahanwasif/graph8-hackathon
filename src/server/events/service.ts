import 'server-only';

import { db } from '@/server/db';
import { graph8, isGraph8Configured } from '@/server/graph8/client';
import {
  composeLeadText,
  createIntakeWorkflow,
  executeIntakeWorkflow,
  launchCampaign,
  provisionEvent,
  type IntakeLead,
} from '@/server/graph8/glue';
import { badRequest, HttpError, notFound } from '@/server/http';
import type { AddLeadInput, CreateEventInput } from '@/server/events/schemas';

/** Match events for this workspace, plus seeded/unassigned ones. Mirrors `capture/read.ts`. */
const workspaceScope = (workspaceId: string) => ({ OR: [{ workspaceId }, { workspaceId: null }] });

/**
 * Create a Debrief event and provision it in graph8.
 *
 * graph8 is the source of truth. An Event is the thin local binding graph8 can't
 * represent (a Slack channel → a graph8 campaign) plus a small display/scorer cache.
 * Defining an event here:
 *   - REUSES the shared, event-agnostic LLM skills (`debrief_extract`, `debrief_draft_followup`) —
 *     they take the event name/goal/target profile as runtime variables, so one pair serves every event,
 *   - provisions the graph8 studio Persona + audience List + cadence Campaign (best-effort).
 * The resulting graph8 ids are stored as pointers on the Event; name/goal/targetProfile are cached
 * for fast list rendering and as the scorer's `{target_profile}` input.
 */

const EXTRACT_SKILL_NAME = 'debrief_extract';
const DRAFT_SKILL_NAME = 'debrief_draft_followup';

export interface EventSummary {
  id: string;
  name: string;
}

/** The live skills.list() payload is `{ actions: [{ action_id, name, ... }] }` (not the typed shape). */
async function findSharedSkillIds(): Promise<{ extractSkillId: string; draftSkillId: string | null }> {
  const g8 = graph8();
  const listed = (await g8.skills.list()) as unknown as {
    actions?: Array<{ action_id?: string; name?: string }>;
  };
  const actions = listed.actions ?? [];
  const idByName = (name: string): string | null =>
    actions.find((action) => action.name === name)?.action_id ?? null;

  const extractSkillId = idByName(EXTRACT_SKILL_NAME);
  if (!extractSkillId) {
    throw new HttpError(
      503,
      `The "${EXTRACT_SKILL_NAME}" skill is not set up in graph8. Seed the Debrief skills before creating events.`,
    );
  }
  return { extractSkillId, draftSkillId: idByName(DRAFT_SKILL_NAME) };
}

/**
 * Provision the graph8 studio Persona + audience List + cadence Campaign for a new
 * event. Best-effort: a failure leaves the pointers null rather than aborting the event.
 */
async function provisionGraph8(
  name: string,
  goal: string,
  targetProfile: string,
): Promise<{ graph8PersonaId: string | null; graph8ListId: string | null; graph8CampaignId: string | null }> {
  try {
    const { personaId, listId, campaignId } = await provisionEvent({ name, goal, targetProfile });
    return { graph8PersonaId: personaId, graph8ListId: listId, graph8CampaignId: campaignId };
  } catch (error) {
    console.error('event bootstrap: graph8 provision failed', error);
    return { graph8PersonaId: null, graph8ListId: null, graph8CampaignId: null };
  }
}

export async function createEvent(input: CreateEventInput & { workspaceId: string }): Promise<EventSummary> {
  const { workspaceId, name, goal, targetProfile, slackChannelId } = input;

  if (!isGraph8Configured()) {
    throw new HttpError(503, 'graph8 is not configured (GRAPH8_API_KEY is missing).');
  }

  const { extractSkillId, draftSkillId } = await findSharedSkillIds();

  // Create the local row FIRST, reserving the channel, so a DB failure can NEVER orphan graph8
  // objects — nothing is provisioned in graph8 until the row exists. The unique constraint on
  // slackChannelId settles the race atomically (no read-then-write gap), and graph8 has no
  // campaign-delete API, so a post-hoc rollback couldn't fully clean up anyway.
  let event: { id: string; name: string };
  try {
    event = await db().event.create({
      data: {
        // Display / scorer cache — graph8 campaign + persona are the source of truth.
        name,
        goal: goal || null,
        targetProfile: targetProfile || null,
        workspaceId,
        slackChannelId,
        // Shared skill pointers already exist in graph8 — safe to store before provisioning.
        graph8ExtractSkillId: extractSkillId,
        graph8DraftSkillId: draftSkillId,
      },
      select: { id: true, name: true },
    });
  } catch (error) {
    // Unique violation on slackChannelId (P2002) → the channel is already bound.
    if ((error as { code?: string }).code === 'P2002') {
      throw badRequest('That Slack channel is already bound to an event.');
    }
    throw error;
  }

  // Now provision graph8 (best-effort) and backfill the pointers onto the row we just created.
  const { graph8PersonaId, graph8ListId, graph8CampaignId } = await provisionGraph8(
    name,
    goal,
    targetProfile,
  );
  const graph8IntakeWorkflowId = graph8ListId
    ? await buildIntakeWorkflow({
        eventName: name,
        eventGoal: goal,
        targetProfile,
        listId: graph8ListId,
        scoreSkillId: extractSkillId,
      })
    : null;

  await db().event.update({
    where: { id: event.id },
    data: { graph8PersonaId, graph8ListId, graph8CampaignId, graph8IntakeWorkflowId },
  });

  return { id: event.id, name: event.name };
}

/** Build the per-event intake workflow in graph8. Best-effort: a failure leaves the pointer null. */
async function buildIntakeWorkflow(input: {
  eventName: string;
  eventGoal: string;
  targetProfile: string;
  listId: string;
  scoreSkillId: string;
}): Promise<string | null> {
  try {
    return await createIntakeWorkflow(input);
  } catch (error) {
    console.error('event bootstrap: intake workflow create failed', error);
    return null;
  }
}

/**
 * Run the event's graph8 intake workflow for one manually-entered lead (the "Add lead"
 * button — works even when Slack is down). graph8 does create → enrich → score → add-to-list.
 */
export interface AddLeadResult {
  leadId: string;
  status: 'PROCESSING' | 'FAILED';
  error: string | null;
}

/**
 * Add a lead: record it locally as PROCESSING, then kick off the event's graph8 intake workflow
 * (graph8 runs create → enrich → score → add-to-list on its side). Returns immediately; the Leads
 * tab finalizes the row (COMPLETED + score, or FAILED) on read via `listEventLeads`.
 */
export async function addLeadToEvent(
  workspaceId: string,
  eventId: string,
  lead: AddLeadInput,
): Promise<AddLeadResult> {
  const event = await db().event.findFirst({
    where: { id: eventId, ...workspaceScope(workspaceId) },
    select: { graph8IntakeWorkflowId: true },
  });
  if (!event) throw notFound('Event not found');
  if (!event.graph8IntakeWorkflowId) {
    throw badRequest('This event has no intake workflow in graph8 yet.');
  }

  const name = [lead.firstName, lead.lastName].filter(Boolean).join(' ') || null;
  const row = await db().lead.create({
    data: {
      event: { connect: { id: eventId } },
      workspaceId,
      email: lead.email || null,
      name,
      title: lead.jobTitle || null,
      company: lead.company || null,
      status: 'PROCESSING',
    },
    select: { id: true },
  });

  const payload: IntakeLead = {
    ...(lead.email ? { email: lead.email } : {}),
    ...(lead.firstName ? { first_name: lead.firstName } : {}),
    ...(lead.lastName ? { last_name: lead.lastName } : {}),
    ...(lead.company ? { company: lead.company } : {}),
    ...(lead.jobTitle ? { job_title: lead.jobTitle } : {}),
    lead_text: composeLeadText({
      first_name: lead.firstName,
      last_name: lead.lastName,
      job_title: lead.jobTitle,
      company: lead.company,
      email: lead.email,
    }),
  };

  try {
    const { executionId } = await executeIntakeWorkflow(event.graph8IntakeWorkflowId, payload);
    await db().lead.update({ where: { id: row.id }, data: { graph8ExecutionId: executionId } });
    return { leadId: row.id, status: 'PROCESSING', error: null };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to start the intake workflow';
    await db().lead.update({ where: { id: row.id }, data: { status: 'FAILED', error: message } });
    return { leadId: row.id, status: 'FAILED', error: message };
  }
}

/**
 * Launch the event's graph8 campaign — starts real outreach. Caller enforces admin +
 * the UI confirms first. Persists the resulting sequence id for enrollment/reads.
 */
export async function launchEvent(
  workspaceId: string,
  eventId: string,
): Promise<{ sequenceId: string | null }> {
  const event = await db().event.findFirst({
    where: { id: eventId, ...workspaceScope(workspaceId) },
    select: { id: true, graph8CampaignId: true },
  });
  if (!event) throw notFound('Event not found');
  if (!event.graph8CampaignId) {
    throw badRequest('This event has no graph8 campaign to launch.');
  }

  const { sequenceId } = await launchCampaign(event.graph8CampaignId);
  if (sequenceId) {
    await db().event.update({ where: { id: event.id }, data: { graph8SequenceId: sequenceId } });
  }
  return { sequenceId };
}

/**
 * Delete an event and everything hanging off it, scoped to the workspace.
 *
 * `Capture` has no `onDelete: Cascade` in the schema (and each capture may own a `ThreadState`),
 * so we tear down children first inside a transaction: thread states -> captures -> event. The
 * graph8 pointers (persona/list/skills) are left as-is — graph8 owns those records and they are
 * shared/reusable, not deleted here.
 */
export async function deleteEvent(workspaceId: string, eventId: string): Promise<void> {
  const event = await db().event.findFirst({
    where: { id: eventId, ...workspaceScope(workspaceId) },
    select: { id: true },
  });
  if (!event) throw notFound('Event not found');

  await db().$transaction(async (tx) => {
    const captures = await tx.capture.findMany({
      where: { eventId },
      select: { id: true },
    });
    const captureIds = captures.map((capture) => capture.id);

    if (captureIds.length > 0) {
      await tx.threadState.deleteMany({ where: { captureId: { in: captureIds } } });
      await tx.capture.deleteMany({ where: { id: { in: captureIds } } });
    }

    await tx.event.delete({ where: { id: eventId } });
  });
}
