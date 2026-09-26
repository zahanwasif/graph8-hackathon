import { ApiError } from '@/lib/api';

/** Format an epoch-ms timestamp as a locale date, or a dash when absent. */
export function formatMemberDate(ms: number | undefined, fallback = '—'): string {
  if (ms === undefined) return fallback;
  return new Date(ms).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

/**
 * Map an error from the workspace-members endpoints to something worth showing.
 *
 * 400 and 403 carry a message the backend wrote for a human ("You cannot remove the last
 * admin…"), so those pass straight through rather than being replaced by a generic line.
 */
export function workspaceMemberErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    switch (error.status) {
      case 400:
      case 403:
        return error.message || 'That change was not allowed.';
      case 401:
        return 'Your session has expired. Please sign in again.';
      case 404:
        return 'That person is no longer in this workspace.';
      case 502:
        return 'We could not reach the identity provider. Try again in a moment.';
      default:
        return error.message || 'Something went wrong, try again.';
    }
  }
  if (error instanceof Error) return error.message;
  return 'Something went wrong, try again.';
}
