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

/** One cadence step for publishing — 'wait' nodes are folded into the next step's `waitDays`. */
export interface PublishSequenceStep {
  type: 'email' | 'call' | 'sms';
  subject: string;
  content: string;
  waitDays: number;
}

export interface PublishSequenceBody {
  finishOnReply: boolean;
  steps: PublishSequenceStep[];
}

/** Publish the workflow builder's cadence as a real (drafted) graph8 sequence. Admin-only. */
export async function publishSequence(
  workspaceId: string,
  eventId: string,
  body: PublishSequenceBody,
): Promise<{ sequenceId: string; pausedSequenceId: string | null }> {
  return apiFetch<{ sequenceId: string; pausedSequenceId: string | null }>(
    `/workspaces/${workspaceId}/events/${eventId}/sequence`,
    { method: 'POST', body: JSON.stringify(body) },
  );
}

/** One step of the event's sequence, for the progress views. */
export interface SequenceStepView {
  order: number;
  type: 'email' | 'call' | 'sms' | 'other';
  title: string;
  waitDays: number;
}

/** Where one enrolled contact stands in the sequence. */
export interface SequenceContactState {
  contactId: string;
  state: string;
  currentStepOrder: number;
}

export interface EventSequence {
  sequenceId: string;
  status: string;
  steps: SequenceStepView[];
  contacts: SequenceContactState[];
}

/** The event's published sequence progress, or null if nothing has been published yet. */
export async function getEventSequence(
  workspaceId: string,
  eventId: string,
): Promise<EventSequence | null> {
  const { sequence } = await apiFetch<{ sequence: EventSequence | null }>(
    `/workspaces/${workspaceId}/events/${eventId}/sequence`,
  );
  return sequence;
}

/** Set which connected mailboxes this event's sequence sends from (the Sending tab). Admin-only. */
export async function setEventSenders(
  workspaceId: string,
  eventId: string,
  mailboxIds: string[],
): Promise<{ senderMailboxIds: string[] }> {
  return apiFetch<{ senderMailboxIds: string[] }>(
    `/workspaces/${workspaceId}/events/${eventId}/senders`,
    { method: 'PUT', body: JSON.stringify({ mailboxIds }) },
  );
}

/** A graph8 sending-window schedule (the "when do we send?" picker). */
export interface Schedule {
  id: string;
  name: string;
  description: string | null;
  timezone: string | null;
  windows: Array<{ day: string; start: string; end: string }>;
}

export interface EventScheduleOptions {
  schedules: Schedule[];
  selectedId: string | null;
}

/** The org's sending-window schedules plus this event's current pick (the Schedule tab). */
export async function getEventSchedule(
  workspaceId: string,
  eventId: string,
): Promise<EventScheduleOptions> {
  return apiFetch<EventScheduleOptions>(
    `/workspaces/${workspaceId}/events/${eventId}/schedule`,
  );
}

/** Set the event's sending-window schedule and sync it to the graph8 sequencer. Admin-only. */
export async function setEventSchedule(
  workspaceId: string,
  eventId: string,
  scheduleId: string | null,
): Promise<{ scheduleId: string | null }> {
  return apiFetch<{ scheduleId: string | null }>(
    `/workspaces/${workspaceId}/events/${eventId}/schedule`,
    { method: 'PUT', body: JSON.stringify({ scheduleId }) },
  );
}

/** One day's sending window (HH:MM, 24-hour), or null for no sending that day. */
export type DayWindow = { start: string; end: string } | null;

/** A week of sending windows, keyed by lowercase day. */
export interface SendingWeek {
  monday?: DayWindow;
  tuesday?: DayWindow;
  wednesday?: DayWindow;
  thursday?: DayWindow;
  friday?: DayWindow;
  saturday?: DayWindow;
  sunday?: DayWindow;
}

export interface ScheduleBody {
  name: string;
  timezone: string;
  description?: string;
  config: SendingWeek;
}

/** Create a sending-window schedule in graph8. Admin-only. */
export async function createSchedule(
  workspaceId: string,
  body: ScheduleBody,
): Promise<{ id: string }> {
  return apiFetch<{ id: string }>(`/workspaces/${workspaceId}/schedules`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

/** Update a sending-window schedule in graph8. Admin-only. */
export async function updateSchedule(
  workspaceId: string,
  scheduleId: string,
  body: Partial<ScheduleBody>,
): Promise<void> {
  await apiFetch<{ ok: true }>(`/workspaces/${workspaceId}/schedules/${scheduleId}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}
