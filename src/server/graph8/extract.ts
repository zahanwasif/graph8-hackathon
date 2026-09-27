import 'server-only';

import { z } from 'zod';

import { runSkill } from './skills';

/**
 * The `debrief_extract` skill contract: transcript/text → structured lead + disposition.
 *
 * The schema is deliberately lenient (nullable/optional, passthrough) — LLM output shape drifts,
 * and the disposition is a free string owned by graph8, not a fixed enum.
 */
export const captureExtractionSchema = z
  .object({
    person: z
      .object({
        fullName: z.string().nullish(),
        title: z.string().nullish(),
        company: z.string().nullish(),
        email: z.string().nullish(),
        linkedinUrl: z.string().nullish(),
      })
      .partial()
      .passthrough(),
    signals: z
      .object({
        skills: z.array(z.string()).default([]),
        seniority: z.string().nullish(),
        yearsExperience: z.number().nullish(),
        highlights: z.array(z.string()).default([]),
        availability: z.string().nullish(),
      })
      .partial()
      .passthrough(),
    summary: z.string().default(''),
    fitScore: z.number().nullish(),
    disposition: z.string(),
    dispositionReason: z.string().default(''),
    nextStep: z.string().nullish(),
    missing: z.array(z.string()).default([]),
  })
  .passthrough();

export type CaptureExtraction = z.infer<typeof captureExtractionSchema>;

export interface ExtractVariables {
  input_text: string;
  event_name: string;
  event_goal: string;
  target_profile: string;
}

export interface ExtractionOutcome {
  ok: boolean;
  extraction?: CaptureExtraction;
  /** The parsed JSON with `undefined`s removed, safe to store in a Prisma Json column. */
  json?: unknown;
  raw: string | null;
  error?: string;
  executionId?: string;
}

/** Strip a ```json … ``` (or ``` … ```) code fence the model sometimes wraps JSON in. */
function stripFences(text: string): string {
  const trimmed = text.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return (fenced ? fenced[1] : trimmed).trim();
}

/** Run `debrief_extract` and return a validated extraction (or a typed failure). */
export async function extractLead(
  skillId: string,
  variables: ExtractVariables,
): Promise<ExtractionOutcome> {
  const run = await runSkill(skillId, variables as unknown as Record<string, unknown>);

  if (run.status !== 'completed' || !run.result) {
    return {
      ok: false,
      raw: run.result,
      error: run.error ?? 'skill did not complete',
      executionId: run.executionId,
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(stripFences(run.result));
  } catch {
    return {
      ok: false,
      raw: run.result,
      error: 'could not parse JSON from skill output',
      executionId: run.executionId,
    };
  }

  const validated = captureExtractionSchema.safeParse(parsed);
  if (!validated.success) {
    return {
      ok: false,
      raw: run.result,
      error: `extraction failed schema validation: ${validated.error.issues[0]?.message ?? 'unknown'}`,
      executionId: run.executionId,
    };
  }

  return {
    ok: true,
    extraction: validated.data,
    json: parsed, // store the raw parse (no undefined) rather than the zod object
    raw: run.result,
    executionId: run.executionId,
  };
}
