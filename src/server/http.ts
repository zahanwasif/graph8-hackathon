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
