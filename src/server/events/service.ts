import 'server-only';

import { db } from '@/server/db';
import { graph8, isGraph8Configured } from '@/server/graph8/client';
import { provisionEvent } from '@/server/graph8/glue';
import { badRequest, HttpError, notFound } from '@/server/http';
import type { CreateEventInput } from '@/server/events/schemas';

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

  // A channel can back only one event (Capture routing is by channel).
  const existing = await db().event.findUnique({ where: { slackChannelId } });
  if (existing) {
    throw badRequest('That Slack channel is already bound to an event.');
  }

  const { extractSkillId, draftSkillId } = await findSharedSkillIds();
  const { graph8PersonaId, graph8ListId, graph8CampaignId } = await provisionGraph8(
    name,
    goal,
    targetProfile,
  );

  const event = await db().event.create({
    data: {
      // Display / scorer cache — graph8 campaign + persona are the source of truth.
      name,
      goal: goal || null,
      targetProfile: targetProfile || null,
      workspaceId,
      slackChannelId,
      // graph8 pointers.
      graph8ExtractSkillId: extractSkillId,
      graph8DraftSkillId: draftSkillId,
      graph8PersonaId,
      graph8ListId,
      graph8CampaignId,
    },
  });

  return { id: event.id, name: event.name };
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
