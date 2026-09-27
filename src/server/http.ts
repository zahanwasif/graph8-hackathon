import { NextResponse } from 'next/server';
import { ZodError } from 'zod';

/**
 * An error a route handler can throw to answer with a specific status. The body shape
 * (`{ message, errors? }`) is what `readApiErrorBody` in `src/lib/api.ts` reads on the client.
 */
export class HttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly errors: string[] = [],
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

export const badRequest = (message: string, errors?: string[]) =>
  new HttpError(400, message, errors);
export const unauthorized = (message = 'Not signed in') => new HttpError(401, message);
export const forbidden = (message = 'You do not have access to this workspace') =>
  new HttpError(403, message);
export const notFound = (message = 'Not found') => new HttpError(404, message);
export const badGateway = (message: string) => new HttpError(502, message);

/**
 * A graph8 SDK error (`G8Error`), duck-typed so this layer stays decoupled from the SDK.
 * These carry a real, user-actionable reason (e.g. "no email channels configured"); surfacing
 * `detail`/`message` beats a blind 500.
 */
function isGraph8Error(
  error: unknown,
): error is { status: number; message: string; detail?: string | null } {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { name?: unknown }).name === 'G8Error' &&
    typeof (error as { status?: unknown }).status === 'number'
  );
}

/** Turns whatever a handler threw into a JSON error response. Unknown errors become a 500. */
export function toErrorResponse(error: unknown): NextResponse {
  if (error instanceof HttpError) {
    return NextResponse.json(
      { message: error.message, ...(error.errors.length ? { errors: error.errors } : {}) },
      { status: error.status },
    );
  }
  if (error instanceof ZodError) {
    return NextResponse.json(
      { message: 'Invalid request', errors: error.issues.map((issue) => issue.message) },
      { status: 400 },
    );
  }
  if (isGraph8Error(error)) {
    // Pass through client-side reasons (4xx) verbatim; treat graph8 server/other errors as an
    // upstream failure (502) rather than pretending it was this app's own 500.
    const status = error.status >= 400 && error.status < 500 ? error.status : 502;
    return NextResponse.json(
      { message: error.detail || error.message || 'graph8 request failed' },
      { status },
    );
  }
  console.error(error);
  return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
}

/** Wraps a route handler so thrown `HttpError`s and validation errors become JSON responses. */
export function route<Args extends unknown[]>(
  handler: (...args: Args) => Promise<Response>,
): (...args: Args) => Promise<Response> {
  return async (...args) => {
    try {
      return await handler(...args);
    } catch (error) {
      return toErrorResponse(error);
    }
  };
}

/** Reads and validates a JSON body; a malformed body is a 400, not a 500. */
export async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw badRequest('Request body must be valid JSON');
  }
}
