import { apiFetch } from '@/lib/api';
import type { EventListItem, EventWithCaptures, LeadListItem } from '@/lib/types/capture';

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

export interface AddLeadBody {
  email?: string;
  firstName?: string;
  lastName?: string;
  companyDomain?: string;
  jobTitle?: string;
}

export interface AddLeadResult {
  leadId: string;
  status: 'PROCESSING' | 'FAILED';
  error: string | null;
}

/** Add a lead — runs the event's graph8 intake workflow (create → enrich → score → list). */
export async function addLead(
  workspaceId: string,
  eventId: string,
  body: AddLeadBody,
): Promise<AddLeadResult> {
  return apiFetch<AddLeadResult>(`/workspaces/${workspaceId}/events/${eventId}/leads`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export interface ImportCaptureLeadsResult {
  queued: number;
  failed: number;
  skipped: number;
}

/** Send the event's Slack captures that aren't leads yet through the graph8 intake workflow. */
export async function importCaptureLeads(
  workspaceId: string,
  eventId: string,
): Promise<ImportCaptureLeadsResult> {
  return apiFetch<ImportCaptureLeadsResult>(
    `/workspaces/${workspaceId}/events/${eventId}/leads/import`,
    { method: 'POST' },
  );
}

/** Leads read straight from the event's graph8 list (the Leads tab). */
export async function getEventLeads(workspaceId: string, eventId: string): Promise<LeadListItem[]> {
  const { leads } = await apiFetch<{ leads: LeadListItem[] }>(
    `/workspaces/${workspaceId}/events/${eventId}/leads`,
  );
  return leads;
}

/** Launch the event's graph8 campaign (starts real outreach). Admin-only. */
export async function launchEvent(
  workspaceId: string,
  eventId: string,
): Promise<{ sequenceId: string | null }> {
  return apiFetch<{ sequenceId: string | null }>(
    `/workspaces/${workspaceId}/events/${eventId}/launch`,
    { method: 'POST' },
  );
}
