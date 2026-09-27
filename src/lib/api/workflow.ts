import { apiFetch } from '@/lib/api';
import type { SequenceOption, WorkflowGraphDTO, WorkflowStep } from '@/lib/types/workflow';

/** The event's graph8 intake workflow, as an editable step list. */
export async function getEventWorkflow(
  workspaceId: string,
  eventId: string,
): Promise<WorkflowGraphDTO> {
  const { workflow } = await apiFetch<{ workflow: WorkflowGraphDTO }>(
    `/workspaces/${workspaceId}/events/${eventId}/workflow`,
  );
  return workflow;
}

export interface SaveWorkflowResponse {
  workflow: WorkflowGraphDTO;
  warnings: string[];
}

/** Save an edited step list back to graph8 (admin-only). */
export async function saveEventWorkflow(
  workspaceId: string,
  eventId: string,
  steps: WorkflowStep[],
): Promise<SaveWorkflowResponse> {
  return apiFetch<SaveWorkflowResponse>(
    `/workspaces/${workspaceId}/events/${eventId}/workflow`,
    { method: 'PUT', body: JSON.stringify({ steps }) },
  );
}

/** Sequences available for the sequencer step's picker. */
export async function getEventSequences(
  workspaceId: string,
  eventId: string,
): Promise<SequenceOption[]> {
  const { sequences } = await apiFetch<{ sequences: SequenceOption[] }>(
    `/workspaces/${workspaceId}/events/${eventId}/workflow/sequences`,
  );
  return sequences;
}
