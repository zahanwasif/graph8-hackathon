/**
 * Alias of `/api/slack/events`, the Slack Events API endpoint. Kept so a Slack app whose
 * Request URL was saved as `/api/integrations/slack/events` keeps working.
 */
export { POST } from '@/app/api/slack/events/route';

// Segment config must be a literal in each route file; it can't be re-exported.
export const maxDuration = 300;
