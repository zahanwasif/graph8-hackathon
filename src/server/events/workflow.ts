import 'server-only';

import { z } from 'zod';

import { db } from '@/server/db';
import { isGraph8Configured } from '@/server/graph8/client';
import {
  listSequenceOptions,
  readWorkflowGraph,
  writeWorkflowGraph,
  type SaveWorkflowResult,
  type WorkflowBuildContext,
} from '@/server/graph8/workflow';
import { HttpError, badRequest, notFound } from '@/server/http';
import type { SequenceOption, WorkflowGraphDTO } from '@/lib/types/workflow';

/**
 * The Workflow tab's server logic. graph8 owns the workflow definition; the Event row
 * only points at it (`graph8IntakeWorkflowId`) and caches the name/goal/target-profile
 * the serializer bakes into node configs. Reads pass through to graph8; saves rebuild
 * the whole graph from the edited step list and PUT it back.
 */

/** Match events for this workspace, plus seeded/unassigned ones. Mirrors the other read models. */
const scope = (workspaceId: string) => ({ OR: [{ workspaceId }, { workspaceId: null }] });

/** The step shape the PUT body accepts; ids are advisory (the server re-keys on save). */
const stepSchema = z.object({
  id: z.string().optional(),
  type: z.enum([
    'create_contact',
    'enrich_contact',
    'action',
    'parse_json',
    'add_to_list',
    'add_to_campaign',
    'delay',
    'send_email',
  ]),
  config: z.record(z.string(), z.unknown()).optional().default({}),
});

export const saveWorkflowSchema = z.object({
  steps: z.array(stepSchema).max(30, 'A workflow can have at most 30 steps.'),
});

export type SaveWorkflowInput = z.infer<typeof saveWorkflowSchema>;

async function requireWorkflowEvent(workspaceId: string, eventId: string) {
  if (!isGraph8Configured()) {
    throw new HttpError(503, 'graph8 is not configured (GRAPH8_API_KEY is missing).');
  }
  const event = await db().event.findFirst({
    where: { id: eventId, ...scope(workspaceId) },
    select: {
      id: true,
      name: true,
      goal: true,
      targetProfile: true,
      graph8ListId: true,
      graph8ExtractSkillId: true,
      graph8IntakeWorkflowId: true,
    },
  });
  if (!event) throw notFound('Event not found');
  if (!event.graph8IntakeWorkflowId) {
    throw badRequest('This event has no intake workflow in graph8 yet.');
  }
  return event;
}

function buildContext(event: {
  name: string;
  goal: string | null;
  targetProfile: string | null;
  graph8ListId: string | null;
  graph8ExtractSkillId: string | null;
}): WorkflowBuildContext {
  return {
    eventName: event.name,
    eventGoal: event.goal ?? '',
    targetProfile: event.targetProfile ?? '',
    listId: event.graph8ListId,
    scoreSkillId: event.graph8ExtractSkillId,
  };
}

/** Read the event's graph8 intake workflow as an editable step list. */
export async function getEventWorkflow(
  workspaceId: string,
  eventId: string,
): Promise<WorkflowGraphDTO> {
  const event = await requireWorkflowEvent(workspaceId, eventId);
  return readWorkflowGraph(event.graph8IntakeWorkflowId!);
}

/** Save an edited step list back to the event's graph8 workflow. */
export async function saveEventWorkflow(
  workspaceId: string,
  eventId: string,
  input: SaveWorkflowInput,
): Promise<SaveWorkflowResult> {
  const event = await requireWorkflowEvent(workspaceId, eventId);
  const steps = input.steps.map((step, i) => ({
    id: step.id ?? `${step.type}-${i + 1}`,
    type: step.type,
    config: step.config,
  }));
  return writeWorkflowGraph(event.graph8IntakeWorkflowId!, steps, buildContext(event));
}

/** Sequences available for the sequencer step's picker (scoped by event existence). */
export async function getEventSequences(
  workspaceId: string,
  eventId: string,
): Promise<SequenceOption[]> {
  await requireWorkflowEvent(workspaceId, eventId);
  return listSequenceOptions();
}
