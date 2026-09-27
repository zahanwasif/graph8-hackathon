import 'server-only';

import { g8 } from '@graph8/sdk';

/**
 * The graph8 SDK, initialized once from the environment.
 *
 * graph8 is the brain and system of record: LLM skills, CRM, lists, deals, workflows. The SDK's
 * `g8` is a process singleton (`g8.init` sets a module-global API key), so we guard init and
 * hand back the ready client. One org key for now (single graph8 org — see idea.md §1); a
 * multi-org future would build per-key clients instead.
 *
 * Server-only: the API key must never reach the browser.
 */
let initialized = false;

function ensureInit(): void {
  if (initialized) return;
  const apiKey = process.env.GRAPH8_API_KEY;
  if (!apiKey) {
    throw new Error('GRAPH8_API_KEY is not set; graph8 features are unavailable.');
  }
  // apiUrl defaults to https://be.graph8.com inside the SDK; override only if set.
  g8.init({ apiKey, ...(process.env.GRAPH8_API_URL ? { apiUrl: process.env.GRAPH8_API_URL } : {}) });
  initialized = true;
}

/** The initialized graph8 SDK singleton. */
export function graph8(): typeof g8 {
  ensureInit();
  return g8;
}

/** Whether a graph8 API key is configured, without throwing — for graceful degradation. */
export function isGraph8Configured(): boolean {
  return Boolean(process.env.GRAPH8_API_KEY);
}
