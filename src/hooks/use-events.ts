'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useOrganization } from '@clerk/nextjs';

import {
  addLead,
  createEvent,
  deleteEvent,
  createSchedule,
  getEventLeads,
  getEventSchedule,
  getEventSequence,
  getWorkspaceEvent,
  getWorkspaceEvents,
  importCaptureLeads,
  launchEvent,
  publishSequence,
  setEventSchedule,
  setEventSenders,
  updateSchedule,
  type AddLeadBody,
  type CreateEventBody,
  type EventScheduleOptions,
  type EventSequence,
  type PublishSequenceBody,
  type Schedule,
  type ScheduleBody,
} from '@/lib/api/events';
import type { EventListItem, EventWithCaptures, LeadListItem } from '@/lib/types/capture';

export const eventKeys = {
  all: ['events'] as const,
  list: (workspaceId: string) => [...eventKeys.all, 'list', workspaceId] as const,
  detail: (workspaceId: string, eventId: string) =>
    [...eventKeys.all, 'detail', workspaceId, eventId] as const,
  leads: (workspaceId: string, eventId: string) =>
    [...eventKeys.all, 'leads', workspaceId, eventId] as const,
};

/** Events for the active workspace. */
export function useEvents() {
  const { organization, isLoaded } = useOrganization();
  const workspaceId = organization?.id;

  return useQuery({
    queryKey: eventKeys.list(workspaceId!),
    queryFn: (): Promise<EventListItem[]> => getWorkspaceEvents(workspaceId!),
    enabled: isLoaded && !!workspaceId,
  });
}

/** One event and its captures. Polls so new captures appear. */
export function useEvent(eventId: string) {
  const { organization, isLoaded } = useOrganization();
  const workspaceId = organization?.id;

  return useQuery({
    queryKey: eventKeys.detail(workspaceId!, eventId),
    queryFn: (): Promise<EventWithCaptures> => getWorkspaceEvent(workspaceId!, eventId),
    enabled: isLoaded && !!workspaceId,
    refetchInterval: 15 * 1000,
  });
}

/** Create an event (provisions graph8) and refresh the events list so it appears. */
export function useCreateEvent() {
  const { organization } = useOrganization();
  const workspaceId = organization?.id;
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (body: CreateEventBody) => {
      if (!workspaceId) throw new Error('No workspace selected');
      return createEvent(workspaceId, body);
    },
    onSuccess: () => {
      if (!workspaceId) return;
      queryClient.invalidateQueries({ queryKey: eventKeys.list(workspaceId) });
    },
  });
}

/** Leads read straight from the event's graph8 list. Enabled only when the Leads tab is active. */
export function useEventLeads(eventId: string, enabled: boolean) {
  const { organization, isLoaded } = useOrganization();
  const workspaceId = organization?.id;

  return useQuery({
    queryKey: eventKeys.leads(workspaceId!, eventId),
    queryFn: (): Promise<LeadListItem[]> => getEventLeads(workspaceId!, eventId),
    enabled: isLoaded && !!workspaceId && enabled,
    // Poll briskly so a PROCESSING lead flips to COMPLETED/FAILED shortly after it settles.
    refetchInterval: 4 * 1000,
  });
}

/**
 * The event's published sequence (status + steps + per-contact progress). Polls so the Live badge
 * and per-lead progress stay current. Returns null until a workflow is published.
 */
export function useEventSequence(eventId: string) {
  const { organization, isLoaded } = useOrganization();
  const workspaceId = organization?.id;

  return useQuery({
    queryKey: [...eventKeys.detail(workspaceId!, eventId), 'sequence'] as const,
    queryFn: (): Promise<EventSequence | null> => getEventSequence(workspaceId!, eventId),
    enabled: isLoaded && !!workspaceId,
    refetchInterval: 10 * 1000,
  });
}

/** Add a lead to an event (runs the graph8 intake workflow), then refresh captures and leads. */
export function useAddLead(eventId: string) {
  const { organization } = useOrganization();
  const workspaceId = organization?.id;
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (body: AddLeadBody) => {
      if (!workspaceId) throw new Error('No workspace selected');
      return addLead(workspaceId, eventId, body);
    },
    onSuccess: () => {
      if (!workspaceId) return;
      queryClient.invalidateQueries({ queryKey: eventKeys.detail(workspaceId, eventId) });
      queryClient.invalidateQueries({ queryKey: eventKeys.leads(workspaceId, eventId) });
    },
  });
}

/** Publish the workflow builder's cadence as a real (drafted) graph8 sequence (admin-only). */
export function usePublishSequence(eventId: string) {
  const { organization } = useOrganization();
  const workspaceId = organization?.id;
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (body: PublishSequenceBody) => {
      if (!workspaceId) throw new Error('No workspace selected');
      return publishSequence(workspaceId, eventId, body);
    },
    onSuccess: () => {
      if (!workspaceId) return;
      // Refresh the event so graph8SequenceId (published state) reflects immediately.
      queryClient.invalidateQueries({ queryKey: eventKeys.detail(workspaceId, eventId) });
    },
  });
}

/** The org's sending-window schedules + this event's pick (the Schedule tab). */
export function useEventSchedule(eventId: string, enabled: boolean) {
  const { organization, isLoaded } = useOrganization();
  const workspaceId = organization?.id;

  return useQuery({
    queryKey: [...eventKeys.detail(workspaceId!, eventId), 'schedule'] as const,
    queryFn: (): Promise<EventScheduleOptions> => getEventSchedule(workspaceId!, eventId),
    enabled: isLoaded && !!workspaceId && enabled,
  });
}

const DAY_ORDER = [
  'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday',
] as const;

/** Convert a per-day sending week (the write shape) to the flat windows array the list uses. */
function weekToWindows(config: ScheduleBody['config']): Schedule['windows'] {
  return DAY_ORDER.flatMap((day) => {
    const window = config[day];
    return window ? [{ day, start: window.start, end: window.end }] : [];
  });
}

/** Create a sending-window schedule in graph8, then refresh the event's schedule options. */
export function useCreateSchedule(eventId: string) {
  const { organization } = useOrganization();
  const workspaceId = organization?.id;
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (body: ScheduleBody) => {
      if (!workspaceId) throw new Error('No workspace selected');
      return createSchedule(workspaceId, body);
    },
    onSuccess: (data, body) => {
      if (!workspaceId) return;
      const key = [...eventKeys.detail(workspaceId, eventId), 'schedule'] as const;
      // Show the new schedule immediately, before the graph8 list read catches up.
      queryClient.setQueryData<EventScheduleOptions>(key, (prev) =>
        prev && !prev.schedules.some((s) => s.id === data.id)
          ? {
              ...prev,
              schedules: [
                ...prev.schedules,
                {
                  id: data.id,
                  name: body.name,
                  description: body.description ?? null,
                  timezone: body.timezone,
                  windows: weekToWindows(body.config),
                },
              ],
            }
          : prev,
      );
      queryClient.invalidateQueries({ queryKey: key });
    },
  });
}

/** Update a sending-window schedule in graph8, then refresh the event's schedule options. */
export function useUpdateSchedule(eventId: string) {
  const { organization } = useOrganization();
  const workspaceId = organization?.id;
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ scheduleId, body }: { scheduleId: string; body: Partial<ScheduleBody> }) => {
      if (!workspaceId) throw new Error('No workspace selected');
      return updateSchedule(workspaceId, scheduleId, body);
    },
    onSuccess: (_data, { scheduleId, body }) => {
      if (!workspaceId) return;
      const key = [...eventKeys.detail(workspaceId, eventId), 'schedule'] as const;
      // Reflect the edit immediately, then reconcile with the server.
      queryClient.setQueryData<EventScheduleOptions>(key, (prev) =>
        prev
          ? {
              ...prev,
              schedules: prev.schedules.map((s) =>
                s.id === scheduleId
                  ? {
                      ...s,
                      ...(body.name != null ? { name: body.name } : {}),
                      ...(body.timezone != null ? { timezone: body.timezone } : {}),
                      ...(body.description !== undefined ? { description: body.description ?? null } : {}),
                      ...(body.config != null ? { windows: weekToWindows(body.config) } : {}),
                    }
                  : s,
              ),
            }
          : prev,
      );
      queryClient.invalidateQueries({ queryKey: key });
      queryClient.invalidateQueries({
        queryKey: [...eventKeys.detail(workspaceId, eventId), 'sequence'],
      });
    },
  });
}

/** Set the event's sending-window schedule (syncs to the graph8 sequencer), then refresh. */
export function useSetEventSchedule(eventId: string) {
  const { organization } = useOrganization();
  const workspaceId = organization?.id;
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (scheduleId: string | null) => {
      if (!workspaceId) throw new Error('No workspace selected');
      return setEventSchedule(workspaceId, eventId, scheduleId);
    },
    onSuccess: () => {
      if (!workspaceId) return;
      queryClient.invalidateQueries({
        queryKey: [...eventKeys.detail(workspaceId, eventId), 'schedule'],
      });
      queryClient.invalidateQueries({
        queryKey: [...eventKeys.detail(workspaceId, eventId), 'sequence'],
      });
    },
  });
}

/** Set which mailboxes the event's sequence sends from (Sending tab), then refresh the event. */
export function useSetEventSenders(eventId: string) {
  const { organization } = useOrganization();
  const workspaceId = organization?.id;
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (mailboxIds: string[]) => {
      if (!workspaceId) throw new Error('No workspace selected');
      return setEventSenders(workspaceId, eventId, mailboxIds);
    },
    onSuccess: () => {
      if (!workspaceId) return;
      queryClient.invalidateQueries({ queryKey: eventKeys.detail(workspaceId, eventId) });
    },
  });
}

/** Import the event's Slack captures as leads, then refresh the event and its leads. */
export function useImportCaptureLeads(eventId: string) {
  const { organization } = useOrganization();
  const workspaceId = organization?.id;
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => {
      if (!workspaceId) throw new Error('No workspace selected');
      return importCaptureLeads(workspaceId, eventId);
    },
    onSuccess: () => {
      if (!workspaceId) return;
      queryClient.invalidateQueries({ queryKey: eventKeys.detail(workspaceId, eventId) });
      queryClient.invalidateQueries({ queryKey: eventKeys.leads(workspaceId, eventId) });
    },
  });
}

/** Launch an event's graph8 campaign (admin-only; starts real outreach). */
export function useLaunchEvent(eventId: string) {
  const { organization } = useOrganization();
  const workspaceId = organization?.id;
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => {
      if (!workspaceId) throw new Error('No workspace selected');
      return launchEvent(workspaceId, eventId);
    },
    onSuccess: () => {
      if (!workspaceId) return;
      queryClient.invalidateQueries({ queryKey: eventKeys.detail(workspaceId, eventId) });
    },
  });
}

/** Delete an event (admin-only) and refresh the events list so it disappears. */
export function useDeleteEvent() {
  const { organization } = useOrganization();
  const workspaceId = organization?.id;
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (eventId: string) => {
      if (!workspaceId) throw new Error('No workspace selected');
      return deleteEvent(workspaceId, eventId);
    },
    onSuccess: (_data, eventId) => {
      if (!workspaceId) return;
      queryClient.invalidateQueries({ queryKey: eventKeys.list(workspaceId) });
      queryClient.removeQueries({ queryKey: eventKeys.detail(workspaceId, eventId) });
    },
  });
}
