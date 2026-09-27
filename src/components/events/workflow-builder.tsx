'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Background,
  Controls,
  Handle,
  Position,
  ReactFlow,
  ReactFlowProvider,
  type Edge,
  type Node,
  type NodeProps,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import {
  AlertTriangle,
  Braces,
  ChevronDown,
  ChevronUp,
  Clock,
  Gauge,
  Loader2,
  Mail,
  ListPlus,
  Plus,
  RotateCcw,
  Save,
  Send,
  Sparkles,
  Trash2,
  UserPlus,
  Workflow,
  Zap,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from '@/components/ui/toast';
import { useEventWorkflow, useSaveWorkflow, useWorkflowSequences } from '@/hooks/use-workflow';
import { ApiError } from '@/lib/api';
import type { WorkflowStep, WorkflowStepType } from '@/lib/types/workflow';
import { cn } from '@/lib/utils';

type IconType = React.ComponentType<{ className?: string }>;

/** Per-step-type presentation + palette metadata. `accent` marks the graph8 sequencer. */
const STEP_META: Record<
  WorkflowStepType,
  { label: string; blurb: string; icon: IconType; accent?: boolean; system?: boolean }
> = {
  create_contact: {
    label: 'Create contact',
    blurb: 'Create the CRM contact from the form fields.',
    icon: UserPlus,
    system: true,
  },
  enrich_contact: {
    label: 'Enrich contact',
    blurb: 'Fill missing fields via the provider waterfall.',
    icon: Sparkles,
  },
  action: {
    label: 'LLM score',
    blurb: 'Score the lead with the debrief_extract skill.',
    icon: Gauge,
    system: true,
  },
  parse_json: {
    label: 'Parse score',
    blurb: 'Parse the score JSON into fitScore + disposition.',
    icon: Braces,
    system: true,
  },
  add_to_list: {
    label: 'Add to list',
    blurb: "Add the contact to the event's audience list.",
    icon: ListPlus,
  },
  add_to_campaign: {
    label: 'Enroll in sequence',
    blurb: 'graph8 sequencer — enroll the contact in a cadence.',
    icon: Send,
    accent: true,
  },
  delay: { label: 'Wait', blurb: 'Pause before the next step.', icon: Clock },
  send_email: { label: 'Send email', blurb: 'Send a one-off email to the contact.', icon: Mail },
};

/** The order steps are offered in the "Add step" palette. */
const PALETTE: WorkflowStepType[] = [
  'enrich_contact',
  'add_to_campaign',
  'delay',
  'send_email',
  'add_to_list',
  'create_contact',
  'action',
  'parse_json',
];

/** Standard fields the enrich step can request. */
const ENRICH_FIELDS: [string, string][] = [
  ['CONTACT_LINKEDIN_URL', 'LinkedIn URL'],
  ['CONTACT_MOBILE_PHONE', 'Mobile phone'],
  ['CONTACT_DIRECT_PHONE', 'Direct phone'],
  ['CONTACT_SENIORITY', 'Seniority'],
  ['CONTACT_COMPANY_NAME', 'Company name'],
];

const DEFAULT_ENRICH = ['CONTACT_LINKEDIN_URL', 'CONTACT_MOBILE_PHONE'];

function defaultConfig(type: WorkflowStepType): WorkflowStep['config'] {
  switch (type) {
    case 'enrich_contact':
      return { fields: [...DEFAULT_ENRICH] };
    case 'delay':
      return { duration: 1, unit: 'days' };
    case 'send_email':
      return { subject: '', content: '' };
    default:
      return {};
  }
}

function stepSummary(step: WorkflowStep): string {
  switch (step.type) {
    case 'create_contact':
      return 'From form submission';
    case 'enrich_contact':
      return `${step.config.fields?.length ?? DEFAULT_ENRICH.length} field(s)`;
    case 'action':
      return 'debrief_extract skill';
    case 'parse_json':
      return 'fitScore + disposition';
    case 'add_to_list':
      return step.config.listId ? `List ${step.config.listId}` : 'Event list';
    case 'add_to_campaign':
      return step.config.sequenceName || (step.config.sequenceId ? `Sequence ${step.config.sequenceId}` : 'No sequence chosen');
    case 'delay':
      return `${step.config.duration ?? 1} ${step.config.unit ?? 'days'}`;
    case 'send_email':
      return step.config.subject || 'No subject';
    default:
      return '';
  }
}

// ── React Flow custom node ────────────────────────────────────────────────────

interface WfNodeData extends Record<string, unknown> {
  title: string;
  subtitle: string;
  summary: string;
  icon: IconType;
  accent: boolean;
  isTrigger: boolean;
}
type WfNode = Node<WfNodeData, 'wf'>;

function WfNodeView({ data, selected }: NodeProps<WfNode>) {
  const Icon = data.icon;
  return (
    <div
      className={cn(
        'w-[236px] rounded-lg border bg-card px-3 py-2 shadow-xs transition-colors',
        selected
          ? 'border-primary ring-2 ring-primary/30'
          : data.accent
            ? 'border-primary/40'
            : 'border-border',
      )}
    >
      {!data.isTrigger ? (
        <Handle
          type="target"
          position={Position.Top}
          className="!size-1.5 !border-0 !bg-muted-foreground/40"
        />
      ) : null}
      <div className="flex items-center gap-2">
        <span
          className={cn(
            'flex size-7 shrink-0 items-center justify-center rounded-md',
            data.accent || data.isTrigger ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground',
          )}
        >
          <Icon className="size-4" />
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-foreground">{data.title}</p>
          <p className="truncate text-xs text-muted-foreground">{data.subtitle}</p>
        </div>
      </div>
      {data.summary ? (
        <p className="mt-1.5 truncate text-xs text-muted-foreground">{data.summary}</p>
      ) : null}
      <Handle
        type="source"
        position={Position.Bottom}
        className="!size-1.5 !border-0 !bg-muted-foreground/40"
      />
    </div>
  );
}

const nodeTypes = { wf: WfNodeView };

// ── Builder ───────────────────────────────────────────────────────────────────

function clone(steps: WorkflowStep[]): WorkflowStep[] {
  return steps.map((s) => ({ id: s.id, type: s.type, config: { ...s.config } }));
}

function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return 'Something went wrong.';
}

type Selection = number | 'trigger' | null;

function WorkflowCanvas({ eventId, isAdmin }: { eventId: string; isAdmin: boolean }) {
  const { data: workflow, isLoading, isError, error } = useEventWorkflow(eventId, true);
  const saveMutation = useSaveWorkflow(eventId);
  const sequencesQuery = useWorkflowSequences(eventId, true);

  const [steps, setSteps] = useState<WorkflowStep[]>([]);
  const [savedSteps, setSavedSteps] = useState<WorkflowStep[]>([]);
  const [selected, setSelected] = useState<Selection>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const initialized = useRef(false);

  useEffect(() => {
    if (workflow && !initialized.current) {
      setSteps(clone(workflow.steps));
      setSavedSteps(clone(workflow.steps));
      initialized.current = true;
    }
  }, [workflow]);

  const dirty = useMemo(
    () => JSON.stringify(steps) !== JSON.stringify(savedSteps),
    [steps, savedSteps],
  );

  const { nodes, edges } = useMemo(() => {
    const nodeList: WfNode[] = [];
    const edgeList: Edge[] = [];

    nodeList.push({
      id: 'trigger',
      type: 'wf',
      position: { x: 0, y: 0 },
      data: {
        title: 'Form submitted',
        subtitle: 'Trigger',
        summary: workflow?.trigger.type ?? 'new_form_submitted',
        icon: Zap,
        accent: false,
        isTrigger: true,
      },
      selectable: true,
    });

    steps.forEach((step, i) => {
      const meta = STEP_META[step.type];
      const id = `step-${i}`;
      nodeList.push({
        id,
        type: 'wf',
        position: { x: 0, y: (i + 1) * 116 },
        data: {
          title: meta.label,
          subtitle: step.type,
          summary: stepSummary(step),
          icon: meta.icon,
          accent: Boolean(meta.accent),
          isTrigger: false,
        },
        selectable: true,
      });
      const source = i === 0 ? 'trigger' : `step-${i - 1}`;
      edgeList.push({
        id: `e-${source}-${id}`,
        source,
        target: id,
        animated: true,
        style: { stroke: 'var(--muted-foreground)', strokeWidth: 1.5 },
      });
    });

    return { nodes: nodeList, edges: edgeList };
  }, [steps, workflow]);

  // Reflect the current selection onto the rendered nodes.
  const selectedNodes = useMemo(
    () =>
      nodes.map((n) => ({
        ...n,
        selected: selected === 'trigger' ? n.id === 'trigger' : n.id === `step-${selected}`,
      })),
    [nodes, selected],
  );

  function addStep(type: WorkflowStepType) {
    setSteps((prev) => {
      const next = [...prev, { id: `${type}-${prev.length + 1}`, type, config: defaultConfig(type) }];
      setSelected(next.length - 1);
      return next;
    });
  }

  function removeStep(index: number) {
    setSteps((prev) => prev.filter((_, i) => i !== index));
    setSelected(null);
  }

  function moveStep(index: number, dir: -1 | 1) {
    const target = index + dir;
    setSteps((prev) => {
      if (target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
    setSelected(target);
  }

  function updateConfig(index: number, patch: Partial<WorkflowStep['config']>) {
    setSteps((prev) =>
      prev.map((s, i) => (i === index ? { ...s, config: { ...s.config, ...patch } } : s)),
    );
  }

  async function handleSave() {
    try {
      const res = await saveMutation.mutateAsync(steps);
      setSteps(clone(res.workflow.steps));
      setSavedSteps(clone(res.workflow.steps));
      setWarnings(res.warnings ?? []);
      toast.add({
        title: res.warnings?.length ? 'Saved with warnings' : 'Workflow saved',
        type: res.warnings?.length ? 'warning' : 'success',
      });
    } catch (err) {
      toast.add({ title: 'Save failed', description: errorMessage(err), type: 'error' });
    }
  }

  function handleDiscard() {
    setSteps(clone(savedSteps));
    setSelected(null);
    setWarnings([]);
  }

  if (isLoading) {
    return (
      <div className="grid gap-4 lg:grid-cols-[1fr_18rem]">
        <Skeleton className="h-[460px] w-full rounded-xl" />
        <Skeleton className="h-[460px] w-full rounded-xl" />
      </div>
    );
  }

  if (isError || !workflow) {
    const notBuilt = error instanceof ApiError && error.status === 400;
    return (
      <EmptyState
        icon={<Workflow />}
        title={notBuilt ? 'No workflow yet' : "Couldn't load the workflow"}
        description={
          notBuilt
            ? 'This event has no graph8 intake workflow. It is created automatically when the event provisions in graph8.'
            : 'The graph8 workflow could not be read. Try again in a moment.'
        }
      />
    );
  }

  const selectedStep = typeof selected === 'number' ? steps[selected] : null;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Workflow className="size-4" />
          <span className="font-medium text-foreground">{workflow.name}</span>
          <Badge variant={workflow.isActive ? 'success' : 'neutral'}>
            {workflow.isActive ? 'Active' : 'Paused'}
          </Badge>
          <span>· {steps.length} step{steps.length === 1 ? '' : 's'}</span>
        </div>
        <div className="flex items-center gap-2">
          {isAdmin ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm">
                  <Plus />
                  Add step
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-64">
                {PALETTE.map((type) => {
                  const meta = STEP_META[type];
                  const Icon = meta.icon;
                  return (
                    <DropdownMenuItem key={type} onClick={() => addStep(type)} className="gap-2">
                      <Icon className="size-4 text-muted-foreground" />
                      <span className="flex flex-col">
                        <span className="text-sm">{meta.label}</span>
                        <span className="text-xs text-muted-foreground">{meta.blurb}</span>
                      </span>
                    </DropdownMenuItem>
                  );
                })}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <span className="text-xs text-muted-foreground">Read-only — admins can edit</span>
          )}
          {isAdmin && dirty ? (
            <>
              <Button variant="ghost" size="sm" onClick={handleDiscard} disabled={saveMutation.isPending}>
                <RotateCcw />
                Discard
              </Button>
              <Button size="sm" onClick={handleSave} disabled={saveMutation.isPending}>
                {saveMutation.isPending ? <Loader2 className="animate-spin" /> : <Save />}
                Save
              </Button>
            </>
          ) : null}
        </div>
      </div>

      {warnings.length > 0 ? (
        <div className="rounded-lg border border-warning-border bg-warning-bg px-3 py-2 text-sm text-warning-fg">
          <div className="flex items-center gap-1.5 font-medium">
            <AlertTriangle className="size-4" />
            graph8 flagged {warnings.length} issue{warnings.length === 1 ? '' : 's'}
          </div>
          <ul className="mt-1 list-disc pl-5 text-xs">
            {warnings.slice(0, 5).map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[1fr_18rem]">
        <div className="h-[460px] w-full overflow-hidden rounded-xl border border-border bg-muted/20">
          <ReactFlow
            nodes={selectedNodes}
            edges={edges}
            nodeTypes={nodeTypes}
            onNodeClick={(_, node) => {
              if (node.id === 'trigger') setSelected('trigger');
              else setSelected(Number(node.id.replace('step-', '')));
            }}
            onPaneClick={() => setSelected(null)}
            nodesDraggable={false}
            nodesConnectable={false}
            fitView
            fitViewOptions={{ padding: 0.2, maxZoom: 1 }}
            minZoom={0.4}
            proOptions={{ hideAttribution: false }}
          >
            <Background gap={16} color="var(--border)" />
            <Controls showInteractive={false} />
          </ReactFlow>
        </div>

        <ConfigPanel
          selection={selected}
          step={selectedStep}
          index={typeof selected === 'number' ? selected : null}
          stepCount={steps.length}
          isAdmin={isAdmin}
          sequences={sequencesQuery.data ?? []}
          sequencesLoading={sequencesQuery.isLoading}
          onUpdate={updateConfig}
          onMove={moveStep}
          onRemove={removeStep}
        />
      </div>
    </div>
  );
}

// ── Config panel ────────────────────────────────────────────────────────────

function ConfigPanel({
  selection,
  step,
  index,
  stepCount,
  isAdmin,
  sequences,
  sequencesLoading,
  onUpdate,
  onMove,
  onRemove,
}: {
  selection: Selection;
  step: WorkflowStep | null;
  index: number | null;
  stepCount: number;
  isAdmin: boolean;
  sequences: { id: string; name: string; status: string | null; stepCount: number | null }[];
  sequencesLoading: boolean;
  onUpdate: (index: number, patch: Partial<WorkflowStep['config']>) => void;
  onMove: (index: number, dir: -1 | 1) => void;
  onRemove: (index: number) => void;
}) {
  const wrap = 'rounded-xl border border-border bg-card p-4';

  if (selection === null) {
    return (
      <div className={cn(wrap, 'flex items-center justify-center text-center')}>
        <p className="text-sm text-muted-foreground">
          Select a step to configure it{isAdmin ? ', or add one from the palette' : ''}.
        </p>
      </div>
    );
  }

  if (selection === 'trigger') {
    return (
      <div className={cn(wrap, 'space-y-2')}>
        <div className="flex items-center gap-2">
          <span className="flex size-7 items-center justify-center rounded-md bg-primary/10 text-primary">
            <Zap className="size-4" />
          </span>
          <div>
            <p className="text-sm font-medium">Form submitted</p>
            <p className="text-xs text-muted-foreground">Trigger</p>
          </div>
        </div>
        <p className="text-sm text-muted-foreground">
          The workflow runs when a lead is submitted (the intake form, or the Add lead button).
          Its fields flow into the steps below.
        </p>
      </div>
    );
  }

  if (!step || index === null) return <div className={wrap} />;

  const meta = STEP_META[step.type];
  const Icon = meta.icon;
  const disabled = !isAdmin;

  return (
    <div className={cn(wrap, 'space-y-3')}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <span
            className={cn(
              'flex size-7 items-center justify-center rounded-md',
              meta.accent ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground',
            )}
          >
            <Icon className="size-4" />
          </span>
          <div>
            <p className="text-sm font-medium">{meta.label}</p>
            <p className="text-xs text-muted-foreground">Step {index + 1}</p>
          </div>
        </div>
        {isAdmin ? (
          <div className="flex items-center gap-0.5">
            <Button
              variant="ghost"
              size="icon-sm"
              disabled={index === 0}
              onClick={() => onMove(index, -1)}
              aria-label="Move up"
            >
              <ChevronUp />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              disabled={index === stepCount - 1}
              onClick={() => onMove(index, 1)}
              aria-label="Move down"
            >
              <ChevronDown />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => onRemove(index)}
              aria-label="Remove step"
            >
              <Trash2 className="text-destructive" />
            </Button>
          </div>
        ) : null}
      </div>

      <p className="text-xs text-muted-foreground">{meta.blurb}</p>

      {meta.system ? (
        <p className="rounded-md bg-muted/50 px-2.5 py-2 text-xs text-muted-foreground">
          This is a core step of the intake pipeline. Its wiring is managed automatically.
        </p>
      ) : null}

      {step.type === 'enrich_contact' ? (
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-foreground">Fields to enrich</p>
          <div className="flex flex-wrap gap-1.5">
            {ENRICH_FIELDS.map(([value, label]) => {
              const active = (step.config.fields ?? DEFAULT_ENRICH).includes(value);
              return (
                <button
                  key={value}
                  type="button"
                  disabled={disabled}
                  onClick={() => {
                    const cur = step.config.fields ?? DEFAULT_ENRICH;
                    const next = active ? cur.filter((f) => f !== value) : [...cur, value];
                    onUpdate(index, { fields: next });
                  }}
                  className={cn(
                    'rounded-full border px-2.5 py-1 text-xs transition-colors disabled:opacity-50',
                    active
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border text-muted-foreground hover:text-foreground',
                  )}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      {step.type === 'add_to_list' ? (
        <label className="block space-y-1">
          <span className="text-xs font-medium text-foreground">List id</span>
          <Input
            value={step.config.listId ?? ''}
            disabled={disabled}
            placeholder="Event list (default)"
            onChange={(e) => onUpdate(index, { listId: e.target.value })}
          />
          <span className="text-xs text-muted-foreground">Leave blank to use the event&apos;s list.</span>
        </label>
      ) : null}

      {step.type === 'add_to_campaign' ? (
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-foreground">Sequence</p>
          {sequencesLoading ? (
            <Skeleton className="h-9 w-full" />
          ) : sequences.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              No sequences found in graph8. Create one, or launch the event to generate its cadence.
            </p>
          ) : (
            <Select
              value={step.config.sequenceId ?? ''}
              disabled={disabled}
              onValueChange={(id) => {
                const seq = sequences.find((s) => s.id === id);
                onUpdate(index, { sequenceId: id, sequenceName: seq?.name });
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Choose a sequence" />
              </SelectTrigger>
              <SelectContent>
                {sequences.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                    {s.stepCount != null ? ` · ${s.stepCount} steps` : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <p className="text-xs text-muted-foreground">
            The graph8 sequencer enrolls the contact and starts the cadence.
          </p>
        </div>
      ) : null}

      {step.type === 'delay' ? (
        <div className="flex items-end gap-2">
          <label className="block flex-1 space-y-1">
            <span className="text-xs font-medium text-foreground">Duration</span>
            <Input
              type="number"
              min={1}
              value={step.config.duration ?? 1}
              disabled={disabled}
              onChange={(e) => onUpdate(index, { duration: Number(e.target.value) || 1 })}
            />
          </label>
          <Select
            value={step.config.unit ?? 'days'}
            disabled={disabled}
            onValueChange={(unit) =>
              onUpdate(index, { unit: unit as 'minutes' | 'hours' | 'days' })
            }
          >
            <SelectTrigger className="w-28">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="minutes">Minutes</SelectItem>
              <SelectItem value="hours">Hours</SelectItem>
              <SelectItem value="days">Days</SelectItem>
            </SelectContent>
          </Select>
        </div>
      ) : null}

      {step.type === 'send_email' ? (
        <div className="space-y-2">
          <label className="block space-y-1">
            <span className="text-xs font-medium text-foreground">Subject</span>
            <Input
              value={step.config.subject ?? ''}
              disabled={disabled}
              onChange={(e) => onUpdate(index, { subject: e.target.value })}
            />
          </label>
          <label className="block space-y-1">
            <span className="text-xs font-medium text-foreground">Body</span>
            <textarea
              value={step.config.content ?? ''}
              disabled={disabled}
              rows={4}
              onChange={(e) => onUpdate(index, { content: e.target.value })}
              className="w-full rounded-lg border border-input bg-muted/50 px-2.5 py-1.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50"
            />
          </label>
        </div>
      ) : null}
    </div>
  );
}

/** The event's graph8 intake workflow, as an editable React Flow canvas. */
export function WorkflowBuilder({
  eventId,
  isAdmin,
  hasWorkflow,
}: {
  eventId: string;
  isAdmin: boolean;
  hasWorkflow: boolean;
}) {
  if (!hasWorkflow) {
    return (
      <EmptyState
        icon={<Workflow />}
        title="No workflow yet"
        description="This event has no graph8 intake workflow. It's provisioned automatically when the event connects to graph8."
      />
    );
  }
  return (
    <ReactFlowProvider>
      <WorkflowCanvas eventId={eventId} isAdmin={isAdmin} />
    </ReactFlowProvider>
  );
}
