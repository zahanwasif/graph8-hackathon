import { auth } from '@clerk/nextjs/server';

import { forbidden, unauthorized } from '@/server/http';

export const ADMIN_ROLE = 'org:admin';
export const MEMBER_ROLE = 'org:member';
export const WORKSPACE_ROLES = [ADMIN_ROLE, MEMBER_ROLE] as const;
export type WorkspaceRole = (typeof WORKSPACE_ROLES)[number];

export interface WorkspaceContext {
  userId: string;
  workspaceId: string;
  role: string;
  isAdmin: boolean;
}

/** Clerk session tokens v1 carried `admin`; v2 carries `org:admin`. Compare on one form. */
function normalizeRole(role: string | null | undefined): string {
  if (!role) return MEMBER_ROLE;
  return role.startsWith('org:') ? role : `org:${role}`;
}

/** The signed-in user id, or a 401. */
export async function requireUser(): Promise<string> {
  const { userId } = await auth();
  if (!userId) throw unauthorized();
  return userId;
}

/**
 * Asserts the caller is signed in with `workspaceId` as their *active* workspace.
 *
 * The workspace id travels in the URL rather than being read from the session
 * alone, so a request fired just before the user switched workspace is refused instead of
 * silently acting on the new one.
 */
export async function requireWorkspace(workspaceId: string): Promise<WorkspaceContext> {
  const { userId, orgId, orgRole } = await auth();
  if (!userId) throw unauthorized();
  if (!orgId || orgId !== workspaceId) throw forbidden();

  const role = normalizeRole(orgRole);
  return { userId, workspaceId, role, isAdmin: role === ADMIN_ROLE };
}

/** {@link requireWorkspace}, and the caller must be a workspace admin. */
export async function requireAdmin(workspaceId: string): Promise<WorkspaceContext> {
  const context = await requireWorkspace(workspaceId);
  if (!context.isAdmin) throw forbidden('Only workspace admins can do that');
  return context;
}
