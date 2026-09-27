'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useOrganization } from '@clerk/nextjs';

import {
  getEventSequences,
  getEventWorkflow,
  saveEventWorkflow,
  type SaveWorkflowResponse,
} from '@/lib/api/workflow';
import type { SequenceOption, WorkflowGraphDTO, WorkflowStep } from '@/lib/types/workflow';

export const workflowKeys = {
  all: ['workflow'] as const,
  detail: (workspaceId: string, eventId: string) =>
    [...workflowKeys.all, 'detail', workspaceId, eventId] as const,
  sequences: (workspaceId: string, eventId: string) =>
    [...workflowKeys.all, 'sequences', workspaceId, eventId] as const,
};

/** The event's graph8 intake workflow. Enabled only when the Workflow tab is active. */
export function useEventWorkflow(eventId: string, enabled: boolean) {
  const { organization, isLoaded } = useOrganization();
  const workspaceId = organization?.id;

  return useQuery({
    queryKey: workflowKeys.detail(workspaceId!, eventId),
    queryFn: (): Promise<WorkflowGraphDTO> => getEventWorkflow(workspaceId!, eventId),
    enabled: isLoaded && !!workspaceId && enabled,
  });
}

/** Sequences for the sequencer step picker. Enabled only when the builder is open. */
export function useWorkflowSequences(eventId: string, enabled: boolean) {
  const { organization, isLoaded } = useOrganization();
  const workspaceId = organization?.id;

  return useQuery({
    queryKey: workflowKeys.sequences(workspaceId!, eventId),
    queryFn: (): Promise<SequenceOption[]> => getEventSequences(workspaceId!, eventId),
    enabled: isLoaded && !!workspaceId && enabled,
    staleTime: 60 * 1000,
  });
}

/** Save an edited workflow (admin-only), then prime the cache with the saved graph. */
export function useSaveWorkflow(eventId: string) {
  const { organization } = useOrganization();
  const workspaceId = organization?.id;
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (steps: WorkflowStep[]): Promise<SaveWorkflowResponse> => {
      if (!workspaceId) throw new Error('No workspace selected');
      return saveEventWorkflow(workspaceId, eventId, steps);
    },
    onSuccess: (result) => {
      if (!workspaceId) return;
      queryClient.setQueryData(workflowKeys.detail(workspaceId, eventId), result.workflow);
    },
  });
}
