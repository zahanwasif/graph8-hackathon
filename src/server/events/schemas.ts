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

/** Input for choosing an event's sending-window schedule (the Schedule tab). Null = graph8 default. */
export const setEventScheduleSchema = z.object({
  scheduleId: z.string().trim().min(1).max(200).nullable(),
});

export type SetEventScheduleInput = z.infer<typeof setEventScheduleSchema>;

/** `HH:MM` 24-hour time. */
const timeString = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use HH:MM (24-hour)');

/** One day's sending window, or null for no sending that day. graph8 rejects start >= end. */
const dayWindowSchema = z
  .object({ start: timeString, end: timeString })
  .refine((w) => w.start < w.end, { message: 'Start must be before end (no overnight windows)' })
  .nullable();

const sendingWeekSchema = z
  .object({
    monday: dayWindowSchema.optional(),
    tuesday: dayWindowSchema.optional(),
    wednesday: dayWindowSchema.optional(),
    thursday: dayWindowSchema.optional(),
    friday: dayWindowSchema.optional(),
    saturday: dayWindowSchema.optional(),
    sunday: dayWindowSchema.optional(),
  })
  .refine((week) => Object.values(week).some((w) => w != null), {
    message: 'Add at least one sending day.',
  });

/** Create a sending-window schedule in graph8 (the Schedule tab editor). */
export const createScheduleSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(120),
  timezone: z.string().trim().min(1).max(64).default('UTC'),
  description: z.string().trim().max(500).optional(),
  config: sendingWeekSchema,
});

export type CreateScheduleInput = z.infer<typeof createScheduleSchema>;

/** Update a sending-window schedule (all fields optional). */
export const updateScheduleSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  timezone: z.string().trim().min(1).max(64).optional(),
  description: z.string().trim().max(500).optional(),
  config: sendingWeekSchema.optional(),
});

export type UpdateScheduleInput = z.infer<typeof updateScheduleSchema>;
