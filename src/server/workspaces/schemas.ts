import { z } from 'zod';

import { WORKSPACE_ROLES } from '@/server/auth';

export const workspaceNameSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Workspace name is required')
    .max(100, 'Workspace name must be 100 characters or fewer'),
});

export const inviteMemberSchema = z.object({
  emailAddress: z.string().trim().email('Enter a valid email address'),
  role: z.enum(WORKSPACE_ROLES),
});
