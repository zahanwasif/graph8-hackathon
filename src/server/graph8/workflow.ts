import 'server-only';

import { graph8 } from './client';
import type {
  SequenceOption,
  WorkflowGraphDTO,
  WorkflowStep,
  WorkflowStepType,
  WorkflowTriggerInfo,
} from '@/lib/types/workflow';

/**
 * The builder-facing facade over graph8 workflows: read a workflow into the
 * normalized {@link WorkflowGraphDTO} step model, and write an edited step list
 * back as the canonical graph8 node graph.
 *
 * graph8 treats a workflow as one record (no per-node CRUD): to edit, fetch it,
 * rebuild `config.nodes`/`config.edges`, and PUT it whole. We regenerate the graph
 * from the step list on every save — deterministic node ids keep it aligned with
 * the intake reader (`checkIntakeExecution` reads `create_contact-1` / `parse_score-1`)
 * and re-derive every `${…}` ref from the current step order, so reordering stays valid.
 *
 * Server-only: the graph8 API key must never reach the browser.
 */

/** The graph8 node types the builder understands, plus the fixed trigger. */
const KNOWN_STEP_TYPES: readonly WorkflowStepType[] = [
  'create_contact',
  'enrich_contact',
  'action',
  'parse_json',
  'add_to_list',
  'add_to_campaign',
  'delay',
  'send_email',
];

/** The intake trigger's form fields (kept fixed; `${trigger.<field>}` refs read these). */
const TRIGGER_FORM_FIELDS = [
  'email',
  'first_name',
  'last_name',
  'company_domain',
  'job_title',
  'lead_text',
];

const DEFAULT_ENRICH_FIELDS = ['CONTACT_LINKEDIN_URL', 'CONTACT_MOBILE_PHONE'];

/** Context the serializer bakes into node configs (from the owning Event). */
export interface WorkflowBuildContext {
  eventName: string;
  eventGoal: string;
  targetProfile: string;
  /** The event's audience list — the default destination for list/create nodes. */
  listId: string | null;
  /** The `debrief_extract` LLM skill id — the score node's `action_id`. */
  scoreSkillId: string | null;
}

// ── Reading: graph8 config → normalized steps ───────────────────────────────

/** A node read out of a graph8 config, tolerant of both the canonical and SDK shapes. */
interface RawNode {
  id: string;
  type: string;
  config: Record<string, unknown>;
  /** Downstream node ids declared on the node itself (canonical shape). */
  connections: string[];
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

/** Pull nodes out of a config, accepting `node_id`/`node_type` or `id`/`type`. */
function readRawNodes(config: Record<string, unknown>): RawNode[] {
  const nodes = Array.isArray(config.nodes) ? (config.nodes as unknown[]) : [];
  return nodes.map((raw) => {
    const n = asRecord(raw);
    const conns = Array.isArray(n.connections) ? (n.connections as unknown[]).map(String) : [];
    return {
      id: String(n.node_id ?? n.id ?? ''),
      type: String(n.node_type ?? n.type ?? ''),
      config: asRecord(n.config),
      connections: conns,
    };
  });
}

/** Order nodes by walking the connection chain from the start/trigger node. */
function orderNodes(rawNodes: RawNode[], config: Record<string, unknown>): RawNode[] {
  const byId = new Map(rawNodes.map((n) => [n.id, n]));
  const next = new Map<string, string>();

  for (const n of rawNodes) {
    if (n.connections.length > 0) next.set(n.id, n.connections[0]);
  }
  // Top-level edges (`edges` or `connections`) fill any gaps.
  const edges = Array.isArray(config.edges)
    ? (config.edges as unknown[])
    : Array.isArray(config.connections)
      ? (config.connections as unknown[])
      : [];
  for (const raw of edges) {
    const e = asRecord(raw);
    const source = String(e.source ?? e.from_node_id ?? '');
    const target = String(e.target ?? e.to_node_id ?? '');
    if (source && target && !next.has(source)) next.set(source, target);
  }

  const start =
    (config.start_node_id ? String(config.start_node_id) : null) ??
    rawNodes.find((n) => n.type === 'trigger')?.id ??
    rawNodes[0]?.id ??
    null;

  const ordered: RawNode[] = [];
  const seen = new Set<string>();
  let cursor: string | null = start;
  while (cursor && byId.has(cursor) && !seen.has(cursor)) {
    seen.add(cursor);
    ordered.push(byId.get(cursor)!);
    cursor = next.get(cursor) ?? null;
  }
  // Append anything the chain missed, so nothing is silently dropped.
  for (const n of rawNodes) if (!seen.has(n.id)) ordered.push(n);
  return ordered;
}

/** Extract the user-editable config for a step from its raw graph8 node config. */
function readStepConfig(type: WorkflowStepType, raw: Record<string, unknown>): WorkflowStep['config'] {
  switch (type) {
    case 'enrich_contact':
      return { fields: Array.isArray(raw.fields) ? (raw.fields as unknown[]).map(String) : [] };
    case 'add_to_list':
      return raw.list_id != null ? { listId: String(raw.list_id) } : {};
    case 'add_to_campaign':
      return {
        ...(raw.sequence_id != null ? { sequenceId: String(raw.sequence_id) } : {}),
        ...(raw.sequence_name != null ? { sequenceName: String(raw.sequence_name) } : {}),
      };
    case 'delay':
      return {
        duration: typeof raw.duration === 'number' ? raw.duration : Number(raw.duration) || 1,
        unit: (['minutes', 'hours', 'days'] as const).includes(raw.unit as never)
          ? (raw.unit as 'minutes' | 'hours' | 'days')
          : 'days',
      };
    case 'send_email':
      return {
        subject: typeof raw.subject === 'string' ? raw.subject : '',
        content: typeof raw.content === 'string' ? raw.content : '',
      };
    default:
      return {};
  }
}

function configToGraph(config: Record<string, unknown>): {
  trigger: WorkflowTriggerInfo;
  steps: WorkflowStep[];
} {
  const ordered = orderNodes(readRawNodes(config), config);

  const triggerNode = ordered.find((n) => n.type === 'trigger');
  const trigger: WorkflowTriggerInfo = {
    type: String(triggerNode?.config.trigger_type ?? 'new_form_submitted'),
    formFields: Array.isArray(triggerNode?.config.form_fields)
      ? (triggerNode!.config.form_fields as unknown[]).map(String)
      : TRIGGER_FORM_FIELDS,
  };

  const steps: WorkflowStep[] = [];
  for (const node of ordered) {
    if (node.type === 'trigger') continue;
    if (!KNOWN_STEP_TYPES.includes(node.type as WorkflowStepType)) continue; // skip unrecognized
    const type = node.type as WorkflowStepType;
    steps.push({ id: node.id || `${type}-${steps.length + 1}`, type, config: readStepConfig(type, node.config) });
  }

  return { trigger, steps };
}

// ── Writing: normalized steps → canonical graph8 config ──────────────────────

/** Human labels for node `name`, matching the intake workflow's wording. */
const STEP_NAMES: Record<WorkflowStepType, string> = {
  create_contact: 'Create contact',
  enrich_contact: 'Enrich contact',
  action: 'LLM score',
  parse_json: 'Parse score',
  add_to_list: 'Add to event list',
  add_to_campaign: 'Enroll in sequence',
  delay: 'Wait',
  send_email: 'Send email',
};

/**
 * The node id for a step's first occurrence, matching the ids the rest of the app
 * reads (`create_contact-1`, `score-1`, `parse_score-1`, …). Later occurrences of a
 * type get `${type}-<n>`.
 */
const CANONICAL_FIRST_ID: Record<WorkflowStepType, string> = {
  create_contact: 'create_contact-1',
  enrich_contact: 'enrich_contact-1',
  action: 'score-1',
  parse_json: 'parse_score-1',
  add_to_list: 'add_list-1',
  add_to_campaign: 'add_to_campaign-1',
  delay: 'delay-1',
  send_email: 'send_email-1',
};

/** Assign deterministic ids: first of each type keeps its canonical name. */
function assignNodeIds(steps: WorkflowStep[]): string[] {
  const counts: Partial<Record<WorkflowStepType, number>> = {};
  return steps.map((step) => {
    const n = (counts[step.type] = (counts[step.type] ?? 0) + 1);
    return n === 1 ? CANONICAL_FIRST_ID[step.type] : `${step.type}-${n}`;
  });
}

/** Build the graph8 `config.node` for one step, deriving refs from surrounding steps. */
function buildNode(
  step: WorkflowStep,
  index: number,
  ids: string[],
  steps: WorkflowStep[],
  ctx: WorkflowBuildContext,
): Record<string, unknown> {
  const nodeId = ids[index];
  const nextId = index + 1 < ids.length ? ids[index + 1] : null;

  // Nearest preceding create_contact → its contact_id ref (for contact-consuming nodes).
  let contactRef: string | null = null;
  for (let i = index - 1; i >= 0; i -= 1) {
    if (steps[i].type === 'create_contact') {
      contactRef = `\${${ids[i]}.contact_id}`;
      break;
    }
  }
  // Nearest preceding action → its result ref (for parse_json).
  let actionRef: string | null = null;
  for (let i = index - 1; i >= 0; i -= 1) {
    if (steps[i].type === 'action') {
      actionRef = `\${${ids[i]}.result}`;
      break;
    }
  }

  const base = {
    node_id: nodeId,
    node_type: step.type,
    name: STEP_NAMES[step.type],
    position: { x: 250 * (index + 1), y: 0 },
    connections: nextId ? [nextId] : [],
  };

  switch (step.type) {
    case 'create_contact':
      return {
        ...base,
        config: {
          email: '${trigger.email}',
          first_name: '${trigger.first_name}',
          last_name: '${trigger.last_name}',
          job_title: '${trigger.job_title}',
          company_domain: '${trigger.company_domain}',
          ...(ctx.listId ? { list_id: Number(ctx.listId) } : {}),
        },
      };
    case 'enrich_contact': {
      const fields = step.config.fields?.length ? step.config.fields : DEFAULT_ENRICH_FIELDS;
      const ref = contactRef ?? '${create_contact-1.contact_id}';
      return {
        ...base,
        config: {
          contact_id: ref,
          fields,
          input_mappings: [{ target_field: 'contact_id', source_expression: ref }],
        },
      };
    }
    case 'action':
      return {
        ...base,
        config: {
          ...(ctx.scoreSkillId ? { action_id: ctx.scoreSkillId } : {}),
          input_mappings: [
            { target_field: 'input_text', source_expression: '${trigger.lead_text}' },
            { target_field: 'event_name', source_expression: ctx.eventName },
            { target_field: 'event_goal', source_expression: ctx.eventGoal },
            { target_field: 'target_profile', source_expression: ctx.targetProfile },
          ],
        },
      };
    case 'parse_json':
      return {
        ...base,
        config: { input: actionRef ?? '${score-1.result}', on_error: 'continue' },
      };
    case 'add_to_list': {
      const listId = step.config.listId || ctx.listId;
      const ref = contactRef ?? '${create_contact-1.contact_id}';
      return {
        ...base,
        config: {
          ...(listId ? { list_id: Number(listId) } : {}),
          input_mappings: [{ target_field: 'contact_ids', source_expression: ref }],
        },
      };
    }
    case 'add_to_campaign': {
      const ref = contactRef ?? '${create_contact-1.contact_id}';
      return {
        ...base,
        config: {
          ...(step.config.sequenceId ? { sequence_id: step.config.sequenceId } : {}),
          ...(step.config.sequenceName ? { sequence_name: step.config.sequenceName } : {}),
          input_mappings: [{ target_field: 'contact_ids', source_expression: ref }],
        },
      };
    }
    case 'delay':
      return {
        ...base,
        config: { duration: Number(step.config.duration ?? 1), unit: step.config.unit ?? 'days' },
      };
    case 'send_email':
      return {
        ...base,
        config: {
          to_recipients: '${trigger.email}',
          subject: step.config.subject ?? '',
          content: step.config.content ?? '',
        },
      };
    default:
      return { ...base, config: {} };
  }
}

/** Rebuild the whole canonical graph8 config from an ordered step list. */
function graphToConfig(steps: WorkflowStep[], ctx: WorkflowBuildContext): Record<string, unknown> {
  const ids = assignNodeIds(steps);
  const firstStepId = ids[0] ?? null;

  const triggerNode = {
    node_id: 'trigger-1',
    node_type: 'trigger',
    name: 'Form submitted',
    config: { trigger_type: 'new_form_submitted', form_fields: TRIGGER_FORM_FIELDS },
    position: { x: 0, y: 0 },
    connections: firstStepId ? [firstStepId] : [],
  };

  const stepNodes = steps.map((step, i) => buildNode(step, i, ids, steps, ctx));
  const nodes = [triggerNode, ...stepNodes];

  // Edges mirror the node connection chain (trigger → step1 → step2 → …).
  const chain = ['trigger-1', ...ids];
  const edges = chain.slice(0, -1).map((source, i) => {
    const target = chain[i + 1];
    return { id: `edge-${source}-${target}`, source, target };
  });

  return { metadata: {}, settings: {}, start_node_id: 'trigger-1', nodes, edges };
}

// ── Public API ───────────────────────────────────────────────────────────────

/** Read a graph8 workflow into the normalized step model. */
export async function readWorkflowGraph(workflowId: string): Promise<WorkflowGraphDTO> {
  const wf = (await graph8().workflows.get(workflowId)) as unknown as {
    id?: string | number;
    name?: string;
    is_active?: boolean;
    config?: Record<string, unknown>;
    data?: { id?: string | number; name?: string; is_active?: boolean; config?: Record<string, unknown> };
  };
  const record = wf.data ?? wf;
  const { trigger, steps } = configToGraph(asRecord(record.config));
  return {
    id: String(record.id ?? workflowId),
    name: record.name ?? 'Intake workflow',
    isActive: Boolean(record.is_active),
    trigger,
    steps,
  };
}

export interface SaveWorkflowResult {
  graph: WorkflowGraphDTO;
  /** Validation errors from graph8, if any (non-fatal — the save still applied). */
  warnings: string[];
}

/** Rebuild the graph8 config from a step list and PUT it. Validates first (best-effort). */
export async function writeWorkflowGraph(
  workflowId: string,
  steps: WorkflowStep[],
  ctx: WorkflowBuildContext,
): Promise<SaveWorkflowResult> {
  const config = graphToConfig(steps, ctx);

  const warnings: string[] = [];
  try {
    const res = (await graph8().workflows.validate({ config: config as never })) as unknown as {
      data?: { valid?: boolean; errors?: Array<{ message?: string }> };
      valid?: boolean;
      errors?: Array<{ message?: string }>;
    };
    const errors = res.data?.errors ?? res.errors ?? [];
    for (const e of errors) if (e?.message) warnings.push(e.message);
  } catch (error) {
    console.error('writeWorkflowGraph: validate failed (continuing)', error);
  }

  // The backend accepts the canonical snake_case graph; the SDK's typed config
  // differs, so pass it loosely (same approach as glue.createIntakeWorkflow).
  await graph8().workflows.update(workflowId, { config: config as never });

  const graph = await readWorkflowGraph(workflowId);
  return { graph, warnings };
}

/** List the org's sequences for the sequencer step's picker. Best-effort → []. */
export async function listSequenceOptions(): Promise<SequenceOption[]> {
  try {
    const list = (await graph8().sequences.list()) as unknown as Array<{
      id: string | number;
      name?: string | null;
      status?: string | null;
      step_count?: number | null;
    }>;
    return (list ?? []).map((s) => ({
      id: String(s.id),
      name: s.name ?? `Sequence ${s.id}`,
      status: s.status ?? null,
      stepCount: s.step_count ?? null,
    }));
  } catch (error) {
    console.error('listSequenceOptions failed', error);
    return [];
  }
}
