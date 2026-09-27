/**
 * The normalized shape the visual workflow builder speaks — shared by the client
 * (React Flow canvas) and the server (graph8 config ⇄ steps converters).
 *
 * A graph8 workflow is a graph of typed nodes joined by connections. Debrief's
 * intake workflows are linear pipelines (form submit → create → enrich → score →
 * … → enroll), so the builder models them as an ordered list of {@link WorkflowStep}s
 * plus a fixed trigger. The server regenerates the canonical graph8 config from this
 * step list on every save, keeping node ids stable so lead finalization keeps working.
 *
 * This file is client-safe: no `server-only`, no graph8 SDK import.
 */

/** The graph8 node types the builder can place. `add_to_campaign` is the sequencer. */
export type WorkflowStepType =
  | 'create_contact'
  | 'enrich_contact'
  | 'action' // LLM skill (the lead scorer)
  | 'parse_json'
  | 'add_to_list'
  | 'add_to_campaign' // graph8 sequencer — enroll the contact in a cadence
  | 'delay'
  | 'send_email';

/** One node in the pipeline. `config` holds only the user-editable fields for its type. */
export interface WorkflowStep {
  /** Stable id within the pipeline (e.g. `create_contact-1`). Server may re-key on save. */
  id: string;
  type: WorkflowStepType;
  /** Type-specific, user-editable config. Refs (`${…}`) are re-derived server-side. */
  config: WorkflowStepConfig;
}

/** Loosely-typed per-step config. Only the keys a given step type reads are present. */
export interface WorkflowStepConfig {
  /** enrich_contact: standard fields to fill via the provider waterfall. */
  fields?: string[];
  /** add_to_list: destination list id (defaults to the event's list). */
  listId?: string;
  /** add_to_campaign (sequencer): the sequence to enroll contacts in. */
  sequenceId?: string;
  sequenceName?: string;
  /** delay: how long to pause. */
  duration?: number;
  unit?: 'minutes' | 'hours' | 'days';
  /** send_email: follow-up email copy. */
  subject?: string;
  content?: string;
}

/** The workflow's trigger — fixed for intake workflows, surfaced read-only in the canvas. */
export interface WorkflowTriggerInfo {
  type: string;
  formFields: string[];
}

/** The full workflow the builder reads and writes. */
export interface WorkflowGraphDTO {
  id: string;
  name: string;
  isActive: boolean;
  trigger: WorkflowTriggerInfo;
  steps: WorkflowStep[];
}

/** A sequence option for the sequencer step's picker. */
export interface SequenceOption {
  id: string;
  name: string;
  status: string | null;
  stepCount: number | null;
}
