import 'server-only';

import type { z } from 'zod';

/**
 * Minimal Groq chat client. Plain `fetch` against Groq's OpenAI-compatible endpoint rather than an
 * SDK — it's one request shape, and this keeps the dependency surface small.
 * https://console.groq.com/docs/api-reference#chat-create
 */

const GROQ_CHAT_URL = 'https://api.groq.com/openai/v1/chat/completions';

/**
 * Fast, on Groq's free tier, and reliable at this extraction (it rebuilds spoken emails like
 * "jane dot doe at acme dot com"). `llama-3.1-8b-instant` is not available to this account.
 * Override with `GROQ_MODEL`.
 */
export const DEFAULT_GROQ_MODEL = 'openai/gpt-oss-20b';

interface ChatCompletionResponse {
  choices?: { message?: { content?: string | null } }[];
}

/**
 * One chat turn that must answer with a JSON object. Uses Groq's JSON mode (`json_object`), which
 * every Groq chat model supports — strict JSON-schema output is limited to a few models — so the
 * expected shape belongs in the system prompt, and the reply is validated with `zodSchema`.
 */
export async function chatJson<T>(input: {
  system: string;
  user: string;
  zodSchema: z.ZodType<T>;
}): Promise<T> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error('GROQ_API_KEY is not set');

  const response = await fetch(GROQ_CHAT_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: process.env.GROQ_MODEL || DEFAULT_GROQ_MODEL,
      temperature: 0,
      messages: [
        { role: 'system', content: input.system },
        { role: 'user', content: input.user },
      ],
      response_format: { type: 'json_object' },
    }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`Groq request failed (${response.status}): ${detail.slice(0, 300)}`);
  }

  const data = (await response.json()) as ChatCompletionResponse;
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error('Groq returned no message content');

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error(`Groq returned non-JSON content: ${content.slice(0, 200)}`);
  }
  return input.zodSchema.parse(parsed);
}
