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

/**
 * Input for publishing the workflow builder's cadence as a real (drafted) graph8 sequence.
 * "wait" nodes are already folded into each step's `waitDays` by the client — graph8 has no
 * standalone wait step; the delay rides on the next step's `time_interval`.
 */
export const publishSequenceSchema = z.object({
  finishOnReply: z.boolean(),
  steps: z
    .array(
      z.object({
        type: z.enum(['email', 'call', 'sms']),
        subject: z.string().max(500).default(''),
        content: z.string().max(10_000).default(''),
        waitDays: z.number().int().min(0).max(365),
      }),
    )
    .min(1, 'Add at least one outreach step before publishing.')
    .max(50),
});

export type PublishSequenceInput = z.infer<typeof publishSequenceSchema>;

/** Input for choosing which connected mailboxes an event's sequence sends from (the Sending tab). */
export const setEventSendersSchema = z.object({
  mailboxIds: z.array(z.string().trim().min(1)).max(50),
});

export type SetEventSendersInput = z.infer<typeof setEventSendersSchema>;
