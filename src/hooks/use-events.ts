'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useOrganization } from '@clerk/nextjs';

import {
  createEvent,
  deleteEvent,
  getWorkspaceEvent,
  getWorkspaceEvents,
  type CreateEventBody,
} from '@/lib/api/events';
import type { EventListItem, EventWithCaptures } from '@/lib/types/capture';

export const eventKeys = {
  all: ['events'] as const,
  list: (workspaceId: string) => [...eventKeys.all, 'list', workspaceId] as const,
  detail: (workspaceId: string, eventId: string) =>
    [...eventKeys.all, 'detail', workspaceId, eventId] as const,
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
