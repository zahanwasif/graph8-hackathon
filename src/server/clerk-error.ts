import { badGateway, badRequest, HttpError, notFound } from '@/server/http';

/** Best-effort human message out of a `ClerkAPIResponseError` (or anything else). */
export function clerkErrorMessage(error: unknown): string {
  const errors = (error as { errors?: { longMessage?: string; message?: string }[] })?.errors;
  const first = errors?.[0];
  if (first?.longMessage || first?.message) {
    return first.longMessage || first.message || '';
  }
  return error instanceof Error ? error.message : String(error);
}

/**
 * Maps a Clerk SDK failure onto an HTTP error.
 *
 * A 404 means the row is already gone, which is worth reporting as such. A 4xx is a
 * rejection the user can act on, so Clerk's own wording is passed through — it explains
 * things we'd otherwise have to guess at, like an instance that caps how many
 * organizations a user may create. Anything else is an upstream failure they can only
 * retry, and the detail goes to the log rather than the response.
 */
export function toClerkHttpError(
  action: string,
  error: unknown,
  notFoundMessage?: string,
): HttpError {
  const status = (error as { status?: number })?.status;
  if (status === 404 && notFoundMessage) {
    return notFound(notFoundMessage);
  }

  const message = clerkErrorMessage(error);
  if (status === 400 || status === 403 || status === 422) {
    console.warn(`Clerk rejected ${action}: ${message}`);
    return badRequest(message);
  }

  console.error(`Clerk ${action} failed: ${message}`);
  return badGateway(`Failed to ${action}`);
}
