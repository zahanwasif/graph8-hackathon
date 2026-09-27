import 'server-only';

import type { z } from 'zod';

/**
 * Minimal xAI (Grok) chat client. Plain `fetch` against the OpenAI-compatible endpoint rather than
 * an SDK — it's one request shape, and this keeps the dependency surface small.
 * https://docs.x.ai/docs/api-reference#chat-completions
 */

const XAI_CHAT_URL = 'https://api.x.ai/v1/chat/completions';

/** Fast, non-reasoning, and cheap enough to run on every capture. Override with `XAI_MODEL`. */
export const DEFAULT_XAI_MODEL = 'grok-4.20-non-reasoning';

interface ChatCompletionResponse {
  choices?: { message?: { content?: string | null } }[];
}

/**
 * One chat turn that must answer with JSON matching `jsonSchema` (xAI structured outputs). The
 * reply is still validated with `zodSchema` — the schema constrains the model, zod protects us.
 */
export async function chatJson<T>(input: {
  system: string;
  user: string;
  /** Name of the schema, reported back by the API. Letters, digits, `_` and `-` only. */
  schemaName: string;
  jsonSchema: Record<string, unknown>;
  zodSchema: z.ZodType<T>;
}): Promise<T> {
  const apiKey = process.env.XAI_API_KEY;
  if (!apiKey) throw new Error('XAI_API_KEY is not set');

  const response = await fetch(XAI_CHAT_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: process.env.XAI_MODEL || DEFAULT_XAI_MODEL,
      temperature: 0,
      messages: [
        { role: 'system', content: input.system },
        { role: 'user', content: input.user },
      ],
      response_format: {
        type: 'json_schema',
        json_schema: { name: input.schemaName, strict: true, schema: input.jsonSchema },
      },
    }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`xAI request failed (${response.status}): ${detail.slice(0, 300)}`);
  }

  const data = (await response.json()) as ChatCompletionResponse;
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error('xAI returned no message content');

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error(`xAI returned non-JSON content: ${content.slice(0, 200)}`);
  }
  return input.zodSchema.parse(parsed);
}
