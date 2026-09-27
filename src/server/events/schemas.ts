import { z } from 'zod';

/** Input for creating a Debrief event from the dashboard. */
export const createEventSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(120),
  goal: z.string().trim().max(500).optional().default(''),
  targetProfile: z.string().trim().max(2000).optional().default(''),
  slackChannelId: z.string().trim().min(1, 'Choose a Slack channel'),
  slackChannelName: z.string().trim().max(120).optional(),
});

export type CreateEventInput = z.infer<typeof createEventSchema>;
