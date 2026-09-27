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
 */

/** Match events for this workspace, plus seeded/unassigned ones. */
const scope = (workspaceId: string) => ({ OR: [{ workspaceId }, { workspaceId: null }] });

/** Safely dig a string out of the stored extraction JSON. */
function readString(extraction: unknown, ...path: string[]): string | null {
  let node: unknown = extraction;
  for (const key of path) {
    if (!node || typeof node !== 'object') return null;
    node = (node as Record<string, unknown>)[key];
  }
  return typeof node === 'string' && node.trim() ? node : null;
}

function toCaptureItem(capture: Capture): CaptureListItem {
  const ex = capture.extraction;
  return {
    id: capture.id,
    inputType: capture.inputType,
    status: capture.status,
    disposition: capture.disposition,
    fitScore: capture.fitScore,
    personName: readString(ex, 'person', 'fullName'),
    personTitle: readString(ex, 'person', 'title'),
    personCompany: readString(ex, 'person', 'company'),
    summary: readString(ex, 'summary'),
    nextStep: readString(ex, 'nextStep'),
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
    captureCount: event.captures.length,
    captures: event.captures.map(toCaptureItem),
  };
}
