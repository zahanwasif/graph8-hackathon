import 'server-only';

import { graph8 } from './client';

/**
 * Run a graph8 LLM skill and wait for the result.
 *
 * graph8 skill execution is asynchronous: `skills.execute` starts a run and returns an
 * execution id; the output arrives once `workflows.getExecution` reports `completed`
 * (executions are unified across skills and workflows). The variables must be nested under
 * `input_data` for the `{placeholder}` substitution to happen — the SDK posts the payload
 * as-is, and the endpoint reads `input_data`.
 */

const POLL_INTERVAL_MS = 1_500;
const DEFAULT_TIMEOUT_MS = 45_000;

export interface SkillRunResult {
  status: 'completed' | 'failed';
  /** Raw text the skill produced (for an LLM skill, `output_data.result`). */
  result: string | null;
  error: string | null;
  executionId: string;
  costUsd?: number;
  durationMs?: number;
}

export async function runSkill(
  skillId: string,
  variables: Record<string, unknown>,
  opts: { timeoutMs?: number } = {},
): Promise<SkillRunResult> {
  const g8 = graph8();

  const started = (await g8.skills.execute(skillId, { input_data: variables })) as {
    execution_id?: string;
    id?: string;
  };
  const executionId = started.execution_id ?? started.id;
  if (!executionId) {
    throw new Error('graph8 skills.execute returned no execution id');
  }

  const deadline = Date.now() + (opts.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  for (;;) {
    // The SDK types getExecution as WorkflowExecution, but the live payload uses snake_case
    // (`output_data`, `error_message`, `cost_usd`) — read it loosely.
    const ex = (await g8.workflows.getExecution(executionId)) as unknown as {
      status: string;
      output_data?: { result?: string } | null;
      error_message?: string | null;
      cost_usd?: number;
      duration_ms?: number;
    };

    if (ex.status === 'completed' || ex.status === 'failed') {
      return {
        status: ex.status,
        result: ex.output_data?.result ?? null,
        error: ex.error_message ?? null,
        executionId,
        costUsd: ex.cost_usd,
        durationMs: ex.duration_ms,
      };
    }

    if (Date.now() > deadline) {
      return {
        status: 'failed',
        result: null,
        error: `graph8 skill ${skillId} did not complete within ${opts.timeoutMs ?? DEFAULT_TIMEOUT_MS}ms`,
        executionId,
      };
    }

    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
}
