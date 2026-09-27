import { apiFetch } from '@/lib/api';
import type { EventListItem, EventWithCaptures } from '@/lib/types/capture';

/** Events (with capture counts) for a workspace. */
export async function getWorkspaceEvents(workspaceId: string): Promise<EventListItem[]> {
  const { events } = await apiFetch<{ events: EventListItem[] }>(`/workspaces/${workspaceId}/events`);
  return events;
}

/** One event and its captures. */
export async function getWorkspaceEvent(
  workspaceId: string,
  eventId: string,
): Promise<EventWithCaptures> {
  const { event } = await apiFetch<{ event: EventWithCaptures }>(
    `/workspaces/${workspaceId}/events/${eventId}`,
  );
  return event;
}

export interface CreateEventBody {
  name: string;
  goal: string;
  targetProfile: string;
  slackChannelId: string;
  slackChannelName?: string;
}

export async function createEvent(
  workspaceId: string,
  body: CreateEventBody,
): Promise<{ id: string; name: string }> {
  const { event } = await apiFetch<{ event: { id: string; name: string } }>(
    `/workspaces/${workspaceId}/events`,
    { method: 'POST', body: JSON.stringify(body) },
  );
  return event;
}

/** Delete an event and its captures. Admin-only; responds 204 with no body. */
export function deleteEvent(workspaceId: string, eventId: string): Promise<void> {
  return apiFetch<void>(`/workspaces/${workspaceId}/events/${eventId}`, {
    method: 'DELETE',
  });
}
