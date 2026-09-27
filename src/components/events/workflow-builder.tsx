'use client';

import { useEffect, useState } from 'react';
import { ArrowDown, ArrowUp, Check, CheckCheck, Clock3, Copy, GitBranch, Loader2, Mail, MessageSquare, Phone, Play, Plus, Save, Send, Sparkles, Trash2, Users, Workflow, Zap } from 'lucide-react';
import { z } from 'zod';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from '@/components/ui/toast';
import { usePublishSequence } from '@/hooks/use-events';
import { ApiError } from '@/lib/api';
import type { PublishSequenceStep } from '@/lib/api/events';
import { cn } from '@/lib/utils';

const stepSchema = z.object({
  id: z.string(), type: z.enum(['email', 'call', 'sms', 'wait']),
  title: z.string(), subject: z.string(), content: z.string(), days: z.number().int().min(1).max(365),
});
type Step = z.infer<typeof stepSchema>;
type Kind = Step['type'];
const draftSchema = z.object({ steps: z.array(stepSchema), stopOnReply: z.boolean() });
const NODES = {
  email: { label: 'Send email', description: 'Make a personal introduction', icon: Mail, color: 'bg-primary/10 text-primary' },
  call: { label: 'Call lead', description: 'Add a personal touch', icon: Phone, color: 'bg-success-bg text-success-fg' },
  sms: { label: 'Send SMS', description: 'Keep the conversation going', icon: MessageSquare, color: 'bg-info-bg text-info-fg' },
  wait: { label: 'Wait', description: 'Give your lead time to respond', icon: Clock3, color: 'bg-warning-bg text-warning-fg' },
};
const INITIAL: Step[] = [
  { id: 'email-1', type: 'email', title: 'Send a warm follow-up', subject: 'Great connecting, {{first_name}}', content: 'Hi {{first_name}},\n\nIt was great connecting at {{event_name}}. I’d love to pick up our conversation and explore how we can help {{company}}.\n\nDo you have 15 minutes this week?', days: 1 },
  { id: 'wait-1', type: 'wait', title: 'Give them a little time', subject: '', content: '', days: 2 },
  { id: 'call-1', type: 'call', title: 'Follow up with a call', subject: '', content: 'Mention our conversation at {{event_name}}. Ask about their priorities and offer to schedule a short demo.', days: 1 },
];
const fieldClass = 'w-full rounded-lg border border-input bg-muted/30 p-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring';

/**
 * Flatten the builder's canvas into graph8 sequence steps: 'wait' nodes aren't steps in graph8,
 * so each wait's days fold into the delay before the next real step. Leading/trailing waits with
 * no following step are dropped (there is nothing to delay).
 */
function toSequenceSteps(steps: Step[]): PublishSequenceStep[] {
  const out: PublishSequenceStep[] = [];
  let pendingWaitDays = 0;
  for (const step of steps) {
    if (step.type === 'wait') {
      pendingWaitDays += step.days;
      continue;
    }
    out.push({ type: step.type, subject: step.subject, content: step.content, waitDays: pendingWaitDays });
    pendingWaitDays = 0;
  }
  return out;
}

export function WorkflowBuilder({
  eventId,
  eventName,
  workspaceId,
  isAdmin,
  publishedSequenceId,
}: {
  eventId: string;
  eventName: string;
  workspaceId: string | null;
  isAdmin: boolean;
  publishedSequenceId: string | null;
}) {
  const storageKey = `event-workflow:v1:${workspaceId ?? 'unassigned'}:${eventId}`;
  const [steps, setSteps] = useState<Step[]>(INITIAL);
  const [selectedId, setSelectedId] = useState<string | null>('email-1');
  const [stopOnReply, setStopOnReply] = useState(true);
  const [saved, setSaved] = useState(false);
  const [ready, setReady] = useState(false);
  const [preview, setPreview] = useState(false);
  const [insertAt, setInsertAt] = useState<number | null>(null);
  const selected = steps.find((step) => step.id === selectedId);
  const publishMutation = usePublishSequence(eventId);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const draft = draftSchema.parse(JSON.parse(raw));
        setSteps(draft.steps);
        setStopOnReply(draft.stopOnReply);
        setSelectedId(draft.steps[0]?.id ?? null);
        setSaved(true);
      }
    } catch {
      toast.add({ title: 'Your saved draft could not be loaded', description: 'The starter sequence is shown. Save to replace the local draft.', type: 'error' });
    }
    setReady(true);
  }, [storageKey]);

  function update(patch: Partial<Step>) {
    setSteps((current) => current.map((step) => step.id === selectedId ? { ...step, ...patch } : step));
    setSaved(false);
  }
  function add(type: Kind, index = insertAt ?? steps.length) {
    const node: Step = { id: crypto.randomUUID(), type, title: NODES[type].label, subject: '', content: '', days: 1 };
    setSteps((current) => [...current.slice(0, index), node, ...current.slice(index)]);
    setSelectedId(node.id);
    setInsertAt(null);
    setSaved(false);
  }
  function move(direction: number) {
    const index = steps.findIndex((step) => step.id === selectedId);
    const next = [...steps];
    [next[index], next[index + direction]] = [next[index + direction], next[index]];
    setSteps(next);
    setSaved(false);
  }
  function save() {
    try {
      localStorage.setItem(storageKey, JSON.stringify({ steps, stopOnReply }));
      setSaved(true);
      toast.add({ title: 'Draft saved in this browser', type: 'success' });
    } catch {
      toast.add({ title: 'Could not save draft', description: 'Browser storage is unavailable. Keep this tab open to retain your edits.', type: 'error' });
    }
  }
  const incomplete = steps.filter((step) => !step.title.trim() || (step.type !== 'wait' && !step.content.trim()) || (step.type === 'email' && !step.subject.trim()));
  const duration = steps.reduce((days, step) => days + (step.type === 'wait' ? step.days : 0), 0);
  const sendSteps = toSequenceSteps(steps);

  async function publish() {
    if (incomplete.length > 0) {
      toast.add({ title: 'Finish every step first', description: 'Each step needs content (emails need a subject) before it can go to graph8.', type: 'error' });
      return;
    }
    if (sendSteps.length === 0) {
      toast.add({ title: 'Nothing to publish', description: 'Add at least one email, call, or SMS step — wait nodes alone aren’t a cadence.', type: 'error' });
      return;
    }
    try {
      const { sequenceId } = await publishMutation.mutateAsync({ finishOnReply: stopOnReply, steps: sendSteps });
      // The published cadence is the record of truth now — keep the local draft in sync with it.
      localStorage.setItem(storageKey, JSON.stringify({ steps, stopOnReply }));
      setSaved(true);
      toast.add({ title: publishedSequenceId ? 'Sequence updated in graph8' : 'Sequence created in graph8', description: `Drafted as sequence ${sequenceId}. Nothing sends until you launch the event.`, type: 'success' });
    } catch (error) {
      const message = error instanceof ApiError ? error.message : error instanceof Error ? error.message : 'Could not publish to graph8. Try again.';
      toast.add({ title: 'Publish failed', description: message, type: 'error' });
    }
  }

  return (
    <section aria-label="Workflow builder" className="overflow-hidden rounded-xl border border-border bg-card shadow-xs">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary"><Workflow className="size-5" /></div>
          <div><div className="flex items-center gap-2"><h2 className="text-sm font-semibold">Event follow-up</h2>{publishedSequenceId ? <Badge variant="success">Published</Badge> : <Badge variant="secondary">Draft</Badge>}</div><p className="mt-1 text-xs text-muted-foreground">Turn a great conversation into the next one.</p></div>
        </div>
        <div className="flex items-center gap-2">
          <span aria-live="polite" className="mr-2 hidden text-xs text-muted-foreground sm:inline">{saved ? 'Saved in this browser' : 'Unsaved draft'}</span>
          <Button variant="outline" onClick={() => setPreview(!preview)}><Play />{preview ? 'Edit sequence' : 'Preview'}</Button>
          <Button variant="outline" onClick={save} disabled={!ready}><Save />Save draft</Button>
          {isAdmin ? (
            <Button onClick={publish} disabled={!ready || publishMutation.isPending}>
              {publishMutation.isPending ? <Loader2 className="animate-spin" /> : <Send />}
              {publishedSequenceId ? 'Republish to graph8' : 'Publish to graph8'}
            </Button>
          ) : null}
        </div>
      </div>
      <div className="grid lg:grid-cols-[200px_minmax(280px,1fr)_300px] xl:grid-cols-[220px_minmax(320px,1fr)_320px]">
        <aside className="border-b border-border p-4 lg:border-r lg:border-b-0">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Node library</p>
          <p className="mt-2 text-xs leading-relaxed text-muted-foreground">Build your sequence, one step at a time.</p>
          <p className="mt-6 mb-2 text-xs font-medium">Outreach</p>
          <div className="grid grid-cols-2 gap-2 lg:grid-cols-1">
            {(Object.keys(NODES) as Kind[]).map((type) => {
              const node = NODES[type];
              return <button key={type} disabled={!ready} onClick={() => add(type)} className="group flex items-center gap-2.5 rounded-lg border border-border p-3 text-left transition-colors hover:border-primary/40 hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring"><span className={cn('flex size-8 shrink-0 items-center justify-center rounded-lg', node.color)}><node.icon className="size-4" /></span><span className="min-w-0 flex-1"><span className="block text-xs font-medium">{node.label}</span><span className="mt-0.5 hidden text-[11px] leading-relaxed text-muted-foreground xl:block">{node.description}</span></span><Plus className="size-3 shrink-0 text-muted-foreground" /></button>;
            })}
          </div>
          <div className="mt-8 rounded-lg bg-muted/50 p-3"><Sparkles className="mb-2 size-4 text-primary" /><p className="text-xs font-medium">A thoughtful first touch</p><p className="mt-1 text-xs leading-relaxed text-muted-foreground">Start with an email, leave a little space, then follow up with a call.</p></div>
          <div className="mt-8 flex items-center gap-2 text-xs text-muted-foreground"><GitBranch className="size-4" />Designed for graph8</div>
        </aside>

        <div className="relative min-w-0 bg-muted/20" style={{ backgroundImage: 'radial-gradient(var(--border) 1px, transparent 1px)', backgroundSize: '20px 20px' }}>
          <div className="flex items-center justify-between border-b border-border bg-card/90 px-4 py-3 text-xs text-muted-foreground"><span className="flex items-center gap-2"><GitBranch className="size-3.5" />{preview ? 'Sequence preview' : 'Sequencer'}</span><span>{steps.length} steps · {duration} day{duration === 1 ? '' : 's'}</span></div>
          {preview ? <div className="space-y-4 p-6"><div className="rounded-lg border border-info-border bg-info-bg p-3 text-xs text-info-fg">Preview only. No messages will be sent. Variables below use a sample lead.</div>{steps.map((step, index) => <div key={step.id} className="rounded-xl border border-border bg-card p-4 shadow-xs"><p className="text-xs text-muted-foreground">Step {index + 1} · {NODES[step.type].label}</p><h3 className="mt-1 text-sm font-semibold">{step.title || 'Untitled step'}</h3>{step.type === 'wait' ? <p className="mt-3 text-sm">Wait {step.days} day{step.days === 1 ? '' : 's'}</p> : <><p className="mt-3 text-sm font-medium">{step.subject.replaceAll('{{first_name}}', 'Alex').replaceAll('{{event_name}}', eventName).replaceAll('{{company}}', 'Acme')}</p><p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">{step.content.replaceAll('{{first_name}}', 'Alex').replaceAll('{{event_name}}', eventName).replaceAll('{{company}}', 'Acme') || 'Add content to this step.'}</p></>}</div>)}{steps.length === 0 && <p className="text-sm text-muted-foreground">Add a node to start your sequence.</p>}</div> : <div className="mx-auto flex max-w-[420px] flex-col items-center px-6 py-8">
            <div className="w-full rounded-xl border border-border bg-card p-4 shadow-xs"><div className="flex items-center gap-3"><span className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary"><Zap className="size-4" /></span><div><p className="text-[10px] font-semibold uppercase tracking-widest text-primary">Entry trigger</p><h3 className="mt-0.5 text-sm font-medium">Lead joins event</h3></div></div><p className="mt-3 flex items-center gap-2 border-t border-border pt-3 text-xs text-muted-foreground"><Users className="size-3.5" /><span className="truncate">{eventName}</span></p></div>
            {Array.from({ length: steps.length + 1 }, (_, index) => {
              const step = steps[index];
              const meta = step && NODES[step.type];
              return <div key={step?.id ?? 'end'} className="flex w-full flex-col items-center"><div className="h-5 w-px bg-border" /><button aria-label={`Insert step at position ${index + 1}`} onClick={() => setInsertAt(insertAt === index ? null : index)} className="flex size-5 items-center justify-center rounded-full border border-border bg-card text-muted-foreground hover:border-primary hover:text-primary focus-visible:outline-2 focus-visible:outline-ring"><Plus className="size-3" /></button>{insertAt === index && <div className="z-10 my-2 flex flex-wrap justify-center gap-1 rounded-lg border border-border bg-card p-2 shadow-sm">{(Object.keys(NODES) as Kind[]).map((type) => <Button key={type} size="xs" variant="ghost" onClick={() => add(type, index)}>{NODES[type].label}</Button>)}</div>}<div className="h-5 w-px bg-border" />{step && meta ? <button onClick={() => setSelectedId(step.id)} aria-pressed={selectedId === step.id} className={cn('w-full rounded-xl border bg-card p-4 text-left shadow-xs transition-colors focus-visible:outline-2 focus-visible:outline-ring', selectedId === step.id ? 'border-primary ring-2 ring-primary/15' : 'border-border hover:border-primary/40')}><div className="flex items-center gap-3"><span className={cn('flex size-9 shrink-0 items-center justify-center rounded-lg', meta.color)}><meta.icon className="size-4" /></span><div className="min-w-0 flex-1"><p className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">{String(index + 1).padStart(2, '0')} / {meta.label}</p><h3 className="mt-1 truncate text-sm font-medium">{step.title || 'Untitled step'}</h3></div>{selectedId === step.id && <span className="size-2 rounded-full bg-primary" />}</div><p className="mt-3 truncate border-t border-border pt-3 text-xs text-muted-foreground">{step.type === 'wait' ? `Continue after ${step.days} day${step.days === 1 ? '' : 's'}` : step.type === 'email' ? step.subject || 'Add an email subject' : step.content || 'Add instructions'}</p></button> : <span className="flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-xs text-muted-foreground"><CheckCheck className="size-3.5" />Sequence complete</span>}</div>;
            })}
          </div>}
        </div>

        <aside className="border-t border-border bg-card lg:border-t-0 lg:border-l">
          <div className="flex items-center justify-between border-b border-border px-4 py-3"><h3 className="text-xs font-semibold">Step settings</h3>{selected && <span className="text-xs text-muted-foreground">{steps.findIndex((s) => s.id === selected.id) + 1} of {steps.length}</span>}</div>
          {selected ? <div className="space-y-5 p-4"><div className="flex items-center gap-2"><span className={cn('rounded-lg p-2', NODES[selected.type].color)}>{(() => { const Icon = NODES[selected.type].icon; return <Icon className="size-4" />; })()}</span><div><h4 className="text-sm font-semibold">{NODES[selected.type].label}</h4><p className="text-xs text-muted-foreground">Configure this step</p></div></div>
            <label className="block space-y-2 text-xs font-medium"><span>Step name</span><Input value={selected.title} onChange={(e) => update({ title: e.target.value })} /></label>
            {selected.type === 'wait' ? <label className="block space-y-2 text-xs font-medium"><span>Wait duration (days)</span><Input type="number" min={1} max={365} value={selected.days} onChange={(e) => update({ days: Math.max(1, Math.min(365, Math.floor(Number(e.target.value)) || 1)) })} /><span className="block font-normal leading-relaxed text-muted-foreground">The next step starts after this delay.</span></label> : <>
              {selected.type === 'email' && <label className="block space-y-2 text-xs font-medium"><span>Subject</span><Input placeholder="A reason to reconnect" value={selected.subject} onChange={(e) => update({ subject: e.target.value })} /></label>}
              <label className="block space-y-2 text-xs font-medium"><span>{selected.type === 'call' ? 'Call instructions' : 'Message'}</span><textarea className={cn(fieldClass, 'min-h-48 resize-y font-normal leading-relaxed')} value={selected.content} onChange={(e) => update({ content: e.target.value })} placeholder={selected.type === 'call' ? 'What should this call cover?' : 'Write a personal follow-up…'} /></label>
              <div><p className="mb-2 text-[11px] text-muted-foreground">Personalize your {selected.type === 'call' ? 'instructions' : 'message'}</p><div className="flex flex-wrap gap-1">{['first_name', 'company', 'event_name'].map((variable) => <button key={variable} onClick={() => update({ content: `${selected.content}{{${variable}}}` })} className="rounded border border-border bg-muted/50 px-1.5 py-1 font-mono text-[10px] text-primary hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring">{`{${variable}}`}</button>)}</div></div>
            </>}
            <div className="flex items-center gap-1 border-t border-border pt-4"><Button size="icon-sm" variant="outline" aria-label="Move step up" disabled={steps[0].id === selected.id} onClick={() => move(-1)}><ArrowUp /></Button><Button size="icon-sm" variant="outline" aria-label="Move step down" disabled={steps.at(-1)?.id === selected.id} onClick={() => move(1)}><ArrowDown /></Button><Button size="icon-sm" variant="outline" aria-label="Duplicate step" onClick={() => { const copy = { ...selected, id: crypto.randomUUID(), title: `${selected.title} (copy)` }; const index = steps.findIndex((s) => s.id === selected.id); setSteps([...steps.slice(0, index + 1), copy, ...steps.slice(index + 1)]); setSelectedId(copy.id); setSaved(false); }}><Copy /></Button><Button className="ml-auto" size="icon-sm" variant="ghost" aria-label="Delete step" onClick={() => { const next = steps.filter((s) => s.id !== selected.id); setSteps(next); setSelectedId(next[0]?.id ?? null); setSaved(false); }}><Trash2 className="text-destructive" /></Button></div>
          </div> : <p className="p-4 text-sm text-muted-foreground">Add a node or select a step to configure it.</p>}
          <div className="space-y-3 border-t border-border p-4"><p className="text-xs font-semibold">Sequence rules</p><label className="flex cursor-pointer items-start gap-2.5"><input type="checkbox" className="mt-0.5 accent-primary" checked={stopOnReply} onChange={(e) => { setStopOnReply(e.target.checked); setSaved(false); }} /><span className="text-xs font-medium">Stop when a lead replies<span className="mt-1 block font-normal leading-relaxed text-muted-foreground">End remaining outreach once a conversation starts.</span></span></label></div>
          <div className="m-4 rounded-lg border border-border p-3 text-xs leading-relaxed text-muted-foreground"><span className="mb-1 flex items-center gap-1.5 font-medium text-foreground">{incomplete.length ? <Clock3 className="size-3.5" /> : <Check className="size-3.5" />}{incomplete.length ? `${incomplete.length} step${incomplete.length === 1 ? '' : 's'} need content` : steps.length ? 'Draft looks good' : 'Your canvas is ready'}</span>{isAdmin ? 'Publish drafts this cadence as a real graph8 sequence. It sends nothing until you launch the event.' : 'Saved drafts stay in this browser. An admin can publish this cadence to graph8.'}</div>
        </aside>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-4 py-2.5 text-[11px] text-muted-foreground"><span className="flex items-center gap-1.5"><span className={cn('size-1.5 rounded-full', publishedSequenceId ? 'bg-success-fg' : 'bg-warning-fg')} />{publishedSequenceId ? 'Published to graph8 · Drafted, not sending — launch the event to start outreach' : 'Draft mode · Publish to create the graph8 sequence'}</span><span>Click a node to edit · Use + to insert a step</span></div>
    </section>
  );
}
