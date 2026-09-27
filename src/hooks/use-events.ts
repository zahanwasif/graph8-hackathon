'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useOrganization } from '@clerk/nextjs';

import {
  addLead,
  createEvent,
  deleteEvent,
  getEventLeads,
  getWorkspaceEvent,
  getWorkspaceEvents,
  importCaptureLeads,
  launchEvent,
  type AddLeadBody,
  type CreateEventBody,
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
