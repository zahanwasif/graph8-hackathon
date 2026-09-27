import 'server-only';

import { db } from '@/server/db';
import { graph8, isGraph8Configured } from '@/server/graph8/client';
import {
  composeLeadText,
  createEventSequence,
  createIntakeWorkflow,
  executeIntakeWorkflow,
  launchCampaign,
  listMailboxes,
  provisionEvent,
  runSequence,
  type IntakeLead,
} from '@/server/graph8/glue';
import { badRequest, HttpError, notFound } from '@/server/http';
import type { AddLeadInput, CreateEventInput, PublishSequenceInput } from '@/server/events/schemas';

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

/**
 * Fill in whatever graph8 setup an event is missing (skills, persona/list/campaign, intake
 * workflow) — for events created before `createEvent` provisioned graph8, or whose provisioning
 * failed. Only null pointers are filled; existing graph8 objects are never recreated. Best-effort:
 * logs and returns on failure. Non-sending (nothing is launched or enrolled).
 */
export async function ensureEventProvisioned(eventId: string): Promise<void> {
  const event = await db().event.findUnique({ where: { id: eventId } });
  if (!event || !isGraph8Configured()) return;
  if (event.graph8ExtractSkillId && event.graph8ListId && event.graph8IntakeWorkflowId) return;

  try {
    const data: {
      graph8ExtractSkillId?: string;
      graph8DraftSkillId?: string | null;
      graph8PersonaId?: string | null;
      graph8ListId?: string | null;
      graph8CampaignId?: string | null;
      graph8IntakeWorkflowId?: string | null;
    } = {};

    let extractSkillId = event.graph8ExtractSkillId;
    if (!extractSkillId) {
      const skills = await findSharedSkillIds();
      extractSkillId = skills.extractSkillId;
      data.graph8ExtractSkillId = skills.extractSkillId;
      if (!event.graph8DraftSkillId) data.graph8DraftSkillId = skills.draftSkillId;
    }

    let listId = event.graph8ListId;
    if (!listId) {
      const provisioned = await provisionGraph8(event.name, event.goal ?? '', event.targetProfile ?? '');
      listId = provisioned.graph8ListId;
      data.graph8ListId = provisioned.graph8ListId;
      if (!event.graph8PersonaId) data.graph8PersonaId = provisioned.graph8PersonaId;
      if (!event.graph8CampaignId) data.graph8CampaignId = provisioned.graph8CampaignId;
    }

    if (!event.graph8IntakeWorkflowId && listId) {
      data.graph8IntakeWorkflowId = await buildIntakeWorkflow({
        eventName: event.name,
        eventGoal: event.goal ?? '',
        targetProfile: event.targetProfile ?? '',
        listId,
        scoreSkillId: extractSkillId,
      });
    }

    await db().event.update({ where: { id: event.id }, data });
    console.log('[event] graph8 provisioned for existing event', { eventId, ...data });
  } catch (error) {
    console.error(`[event] ${eventId}: graph8 provisioning failed`, error);
  }
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

  return startIntakeLead({
    event: { id: eventId, graph8IntakeWorkflowId: event.graph8IntakeWorkflowId },
    workspaceId,
    lead,
  });
}

/**
 * Shared by the "Add lead" button and Slack captures (`queueCaptureLead`): record the lead as
 * PROCESSING and start the event's graph8 intake workflow. `notes` (the raw Slack text/transcript)
 * is appended to the scorer's lead text; `captureId` links a Slack-sourced lead to its capture.
 */
export async function startIntakeLead(params: {
  event: { id: string; graph8IntakeWorkflowId: string };
  workspaceId: string | null;
  lead: AddLeadInput;
  captureId?: string;
  notes?: string | null;
}): Promise<AddLeadResult> {
  const { event, workspaceId, lead, captureId, notes } = params;

  const name = [lead.firstName, lead.lastName].filter(Boolean).join(' ') || null;
  const row = await db().lead.create({
    data: {
      event: { connect: { id: event.id } },
      ...(captureId ? { capture: { connect: { id: captureId } } } : {}),
      workspaceId,
      email: lead.email || null,
      name,
      title: lead.jobTitle || null,
      company: lead.companyDomain || null,
      status: 'PROCESSING',
    },
    select: { id: true },
  });

  const payload: IntakeLead = {
    ...(lead.email ? { email: lead.email } : {}),
    ...(lead.firstName ? { first_name: lead.firstName } : {}),
    ...(lead.lastName ? { last_name: lead.lastName } : {}),
    ...(lead.companyDomain ? { company_domain: lead.companyDomain } : {}),
    ...(lead.jobTitle ? { job_title: lead.jobTitle } : {}),
    lead_text: [
      composeLeadText({
        first_name: lead.firstName,
        last_name: lead.lastName,
        job_title: lead.jobTitle,
        company_domain: lead.companyDomain,
        email: lead.email,
      }),
      notes?.trim() ? `Notes: ${notes.trim()}` : null,
    ]
      .filter(Boolean)
      .join(' '),
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
 * Publish the workflow builder's cadence as a real, DRAFTED graph8 sequence, linked to the
 * event's campaign + audience list. Nothing is sent — drafting only; the confirmed Launch step
 * runs it. Stores the sequence id on the event so Launch runs *this* sequence (see `launchEvent`).
 *
 * Idempotent per publish: graph8 has no sequence-replace API, so re-publishing creates a fresh
 * drafted sequence and repoints the event at it (the previous draft is orphaned, never launched).
 */
export async function publishEventSequence(
  workspaceId: string,
  eventId: string,
  ownerEmail: string,
  input: PublishSequenceInput,
): Promise<{ sequenceId: string }> {
  const event = await db().event.findFirst({
    where: { id: eventId, ...workspaceScope(workspaceId) },
    select: {
      id: true,
      name: true,
      graph8CampaignId: true,
      graph8ListId: true,
      graph8SenderMailboxIds: true,
    },
  });
  if (!event) throw notFound('Event not found');
  if (!event.graph8CampaignId) {
    throw badRequest('This event has no graph8 campaign yet, so its cadence can’t be published.');
  }

  // Resolve the event's sending accounts into email channels. The selected mailboxes (Sending tab)
  // win; an empty selection falls back to every connected mailbox so a launch still has a channel.
  const mailboxes = await listMailboxes();
  const selected = event.graph8SenderMailboxIds;
  const chosen = selected.length
    ? mailboxes.filter((mailbox) => selected.includes(mailbox.id))
    : mailboxes;
  if (chosen.length === 0) {
    throw badRequest(
      'No sending account is connected. Add an email account (Settings → Email accounts) before publishing.',
    );
  }

  const { sequenceId } = await createEventSequence({
    eventName: event.name,
    ownerEmail,
    campaignId: event.graph8CampaignId,
    listId: event.graph8ListId,
    finishOnReply: input.finishOnReply,
    steps: input.steps,
    channels: chosen.map((mailbox) => ({
      mailboxId: mailbox.id,
      email: mailbox.email ?? '',
      provider: mailbox.provider,
    })),
  });

  await db().event.update({ where: { id: event.id }, data: { graph8SequenceId: sequenceId } });
  return { sequenceId };
}

/**
 * Set which connected mailboxes this event's sequence sends from (the Sending tab). Stored as
 * pointers on the event; attached as the sequence's email channels at publish. Changing the
 * selection takes effect the next time the workflow is published. Admin-only (route-enforced).
 */
export async function setEventSenders(
  workspaceId: string,
  eventId: string,
  mailboxIds: string[],
): Promise<{ senderMailboxIds: string[] }> {
  const event = await db().event.findFirst({
    where: { id: eventId, ...workspaceScope(workspaceId) },
    select: { id: true },
  });
  if (!event) throw notFound('Event not found');

  // Only persist ids that map to a real connected mailbox — a stale/guessed id would silently
  // drop that sender at publish and confuse the "which channels?" picture.
  const mailboxes = await listMailboxes();
  const valid = new Set(mailboxes.map((mailbox) => mailbox.id));
  const senderMailboxIds = [...new Set(mailboxIds)].filter((id) => valid.has(id));

  await db().event.update({ where: { id: event.id }, data: { graph8SenderMailboxIds: senderMailboxIds } });
  return { senderMailboxIds };
}

/**
 * Launch the event — starts real outreach. Caller enforces admin + the UI confirms first.
 *
 * Prefers the sequence published from the workflow builder (`graph8SequenceId`): that is the
 * cadence the user actually authored, so we run it directly. Falls back to launching the dormant
 * campaign (`campaigns.launch`) for events provisioned before a cadence was published. Persists
 * the resulting sequence id for reads.
 */
export async function launchEvent(
  workspaceId: string,
  eventId: string,
): Promise<{ sequenceId: string | null }> {
  const event = await db().event.findFirst({
    where: { id: eventId, ...workspaceScope(workspaceId) },
    select: { id: true, graph8CampaignId: true, graph8SequenceId: true },
  });
  if (!event) throw notFound('Event not found');

  // Builder-published sequence wins — it's the cadence the user authored.
  if (event.graph8SequenceId) {
    await runSequence(event.graph8SequenceId);
    return { sequenceId: event.graph8SequenceId };
  }

  if (!event.graph8CampaignId) {
    throw badRequest('This event has no cadence to launch. Publish a workflow first.');
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
 * so we tear down children first inside a transaction: leads -> thread states -> captures -> event. The
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
    // Leads reference both the event and (for Slack-sourced ones) a capture — remove them first.
    await tx.lead.deleteMany({ where: { eventId } });

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
