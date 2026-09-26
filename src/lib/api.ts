export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    /**
     * Per-item detail the API attached alongside the summary message, when it sent any.
     *
     * A route handler can attach `errors` alongside `message` to explain *which* thing was wrong.
     * Reading only `message` throws that away and leaves the user with an unactionable summary.
     */
    public readonly details: string[] = [],
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/**
 * Pull the summary message and any per-item detail out of an error response body.
 *
 * `message` is a string (or an array of validation messages); `errors` is the extra array a
 * route handler attaches for multi-problem failures. See `src/server/http.ts`.
 */
export function readApiErrorBody(
  body: unknown,
  fallback: string,
): { message: string; details: string[] } {
  if (!body || typeof body !== 'object') return { message: fallback, details: [] };
  const payload = body as { message?: string | string[]; errors?: unknown };

  let message = fallback;
  if (typeof payload.message === 'string') message = payload.message;
  else if (Array.isArray(payload.message)) message = payload.message.join(', ');

  const details = Array.isArray(payload.errors)
    ? payload.errors.filter((e): e is string => typeof e === 'string')
    : [];

  return { message, details };
}

/**
 * Calls one of this app's own `/api` route handlers. Same origin, so the Clerk session cookie
 * authenticates the request — no bearer token to fetch first.
 */
export async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`/api${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  if (!response.ok) {
    let message = `Request failed with status ${response.status}`;
    let details: string[] = [];

    try {
      ({ message, details } = readApiErrorBody(await response.json(), message));
    } catch {
      // ignore JSON parse errors
    }

    throw new ApiError(message, response.status, details);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}
