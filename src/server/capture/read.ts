import 'server-only';

import type { Capture } from '@prisma/client';

import { db } from '@/server/db';
import type { CaptureListItem, EventListItem, EventWithCaptures } from '@/lib/types/capture';

/**
 * Read models for the Events section.
 *
 * Events are scoped to the workspace. While the only ways to create an Event are the seed and the
 * new-event dialog, events with a null `workspaceId` (the seed) are treated as unassigned and
 * shown too. Drop the null branch once every Event is workspace-bound.
 *
 * A capture's person/score fields come straight from the local display cache — the graph8 contact
 * (`graph8ContactId`) + its criteria_score field remain the source of truth; the cache exists so
 * the list renders without a graph8 round-trip.
 */

/** Match events for this workspace, plus seeded/unassigned ones. */
const scope = (workspaceId: string) => ({ OR: [{ workspaceId }, { workspaceId: null }] });

function toCaptureItem(capture: Capture): CaptureListItem {
  return {
    id: capture.id,
    inputType: capture.inputType,
    status: capture.status,
    disposition: capture.disposition,
    fitScore: capture.fitScore,
    personName: capture.personName,
    personTitle: capture.personTitle,
    personCompany: capture.personCompany,
    personEmail: capture.personEmail,
    personFirstName: capture.personFirstName,
    personLastName: capture.personLastName,
    summary: capture.summary,
    nextStep: capture.nextStep,
    rawText: capture.rawText,
    error: capture.error,
    slackChannelId: capture.slackChannelId,
    slackThreadTs: capture.slackThreadTs,
    createdAt: capture.createdAt.toISOString(),
  };
}

/** The events table for the Events list page. */
export async function listWorkspaceEvents(workspaceId: string): Promise<EventListItem[]> {
  const events = await db().event.findMany({
    where: scope(workspaceId),
    orderBy: { createdAt: 'desc' },
    include: { _count: { select: { captures: true } } },
  });

  return events.map((event) => ({
    id: event.id,
    name: event.name,
    goal: event.goal,
    slackChannelId: event.slackChannelId,
    isActive: event.isActive,
    workspaceId: event.workspaceId,
    captureCount: event._count.captures,
  }));
}

/** One event and its captures, or null when it isn't in this workspace. */
export async function getWorkspaceEvent(
  workspaceId: string,
  eventId: string,
): Promise<EventWithCaptures | null> {
  const event = await db().event.findFirst({
    where: { id: eventId, ...scope(workspaceId) },
    include: { captures: { orderBy: { createdAt: 'desc' } } },
  });
  if (!event) return null;

  return {
    id: event.id,
    name: event.name,
    goal: event.goal,
    slackChannelId: event.slackChannelId,
    isActive: event.isActive,
    workspaceId: event.workspaceId,
    graph8CampaignId: event.graph8CampaignId,
    graph8SequenceId: event.graph8SequenceId,
    captureCount: event.captures.length,
    captures: event.captures.map(toCaptureItem),
  };
}
