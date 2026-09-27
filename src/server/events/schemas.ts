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

/** Input for the "Add lead" button — runs the event's graph8 intake workflow. */
export const addLeadSchema = z
  .object({
    // Optional, but must be a valid email when provided.
    email: z.union([z.string().trim().email('Enter a valid email'), z.literal('')]).optional().default(''),
    firstName: z.string().trim().max(120).optional().default(''),
    lastName: z.string().trim().max(120).optional().default(''),
    companyDomain: z.string().trim().max(255).optional().default(''),
    jobTitle: z.string().trim().max(200).optional().default(''),
  })
  // Enrichment needs an anchor; the contact needs ≥1 field. Require at least one identifier.
  .refine((d) => Boolean(d.email || d.firstName || d.lastName || d.companyDomain), {
    message: 'Provide at least a name, email, or company domain.',
    path: ['email'],
  });

export type AddLeadInput = z.infer<typeof addLeadSchema>;
