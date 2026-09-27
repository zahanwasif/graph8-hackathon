import { z } from 'zod';

/** Input for connecting an SMTP/IMAP sending mailbox in graph8 (the "Add email account" form). */
export const connectMailboxSchema = z.object({
  email: z.string().trim().email('Enter a valid email address').max(255),
  displayName: z.string().trim().max(120).optional().default(''),
  smtpAddress: z.string().trim().min(1, 'SMTP host is required').max(255),
  smtpPort: z.number().int().min(1).max(65535).optional(),
  smtpUsername: z.string().trim().min(1, 'SMTP username is required').max(255),
  smtpPassword: z.string().min(1, 'SMTP password is required').max(1024),
  imapAddress: z.string().trim().min(1, 'IMAP host is required').max(255),
  imapPort: z.number().int().min(1).max(65535).optional(),
  imapUsername: z.string().trim().min(1, 'IMAP username is required').max(255),
  imapPassword: z.string().min(1, 'IMAP password is required').max(1024),
  dailyLimit: z.number().int().min(1).max(2000).optional(),
});

export type ConnectMailboxInput = z.infer<typeof connectMailboxSchema>;
