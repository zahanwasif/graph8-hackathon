import 'server-only';

import { db } from '@/server/db';
import { graph8, isGraph8Configured } from '@/server/graph8/client';
import { badRequest, HttpError, notFound } from '@/server/http';
import type { CreateEventInput } from '@/server/events/schemas';

/** Match events for this workspace, plus seeded/unassigned ones. Mirrors `capture/read.ts`. */
const workspaceScope = (workspaceId: string) => ({ OR: [{ workspaceId }, { workspaceId: null }] });

/**
 * Create a Debrief event and provision it in graph8.
 *
 * graph8 owns the outcome. Defining an event here:
 *   - REUSES the shared, event-agnostic LLM skills (`debrief_extract`, `debrief_draft_followup`)
 *     — they take the event name/goal/target profile as runtime variables, so one pair serves
 *     every event.
 *   - creates a per-event Persona (the target profile) and audience List (best-effort — capture +
 *     extraction only need the extract skill and the stored `targetProfile` text).
 * The resulting graph8 ids are stored as pointers on the Event.
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

/** Create the per-event Persona. Best-effort: a failure leaves the pointer null, not the whole flow. */
async function createPersona(name: string, goal: string, targetProfile: string): Promise<string | null> {
  try {
    const res = (await graph8().studio.createPersona({
      title: `${name} — target profile`,
      website_url: 'https://graph8.com',
      ...(goal ? { why_target: goal } : {}),
      ...(targetProfile ? { campaign_approach: targetProfile } : {}),
      source: 'debrief',
    })) as unknown as { data?: { id?: string }; id?: string };
    return res.data?.id ?? res.id ?? null;
  } catch (error) {
    console.error('event bootstrap: persona create failed', error);
    return null;
  }
}

/** Create the per-event audience List. Best-effort. */
async function createList(name: string): Promise<string | null> {
  try {
    const res = (await graph8().lists.create(`Event: ${name}`, 'contacts')) as unknown as {
      data?: { id?: number | string };
      id?: number | string;
    };
    const raw = res.data?.id ?? res.id ?? null;
    return raw == null ? null : String(raw);
  } catch (error) {
    console.error('event bootstrap: list create failed', error);
    return null;
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
  const [graph8PersonaId, graph8ListId] = await Promise.all([
    createPersona(name, goal, targetProfile),
    createList(name),
  ]);

  const event = await db().event.create({
    data: {
      name,
      goal: goal || null,
      targetProfile: targetProfile || null,
      workspaceId,
      slackChannelId,
      graph8ExtractSkillId: extractSkillId,
      graph8DraftSkillId: draftSkillId,
      graph8PersonaId,
      graph8ListId,
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
