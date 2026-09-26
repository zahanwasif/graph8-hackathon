/** The roles this Clerk instance exposes. Mirrors the backend's `WORKSPACE_ROLES`. */
export const WORKSPACE_ROLES = ['org:admin', 'org:member'] as const;
export type WorkspaceRole = (typeof WORKSPACE_ROLES)[number];

export const ADMIN_ROLE: WorkspaceRole = 'org:admin';

/** A member of the current workspace, as returned by `GET /workspaces/:id/members`. */
export interface WorkspaceMember {
  /** Clerk membership id — stable per (user, workspace) pair. */
  id: string;
  userId: string;
  name: string | null;
  email: string | null;
  imageUrl: string | null;
  role: string;
  /** Epoch milliseconds. */
  joinedAt: number;
}

/** An invitation that has been sent but not yet accepted, revoked, or expired. */
export interface WorkspaceInvitation {
  id: string;
  email: string;
  role: string;
  status: string;
  /** Epoch milliseconds. */
  createdAt: number;
  /** Epoch milliseconds. */
  expiresAt: number;
}

export interface InviteMemberInput {
  emailAddress: string;
  role: WorkspaceRole;
}

export interface CreateWorkspaceInput {
  name: string;
}

export interface CreatedWorkspace {
  id: string;
  name: string;
}

/** Human label for a Clerk role key; falls back to the raw key for custom roles. */
export function roleLabel(role: string): string {
  switch (role) {
    case 'org:admin':
      return 'Admin';
    case 'org:member':
      return 'Member';
    default:
      return role.replace(/^org:/, '');
  }
}

/** True when the role may manage members — i.e. the mutations the backend gates on. */
export function isAdminRole(role: string | null | undefined): boolean {
  return role === ADMIN_ROLE;
}

/** What to show for a member with no profile name yet: their email, else a placeholder. */
export function memberDisplayName(member: Pick<WorkspaceMember, 'name' | 'email'>): string {
  return member.name?.trim() || member.email?.trim() || 'Unknown member';
}
