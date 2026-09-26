import { apiFetch } from '@/lib/api';
import type {
  CreateWorkspaceInput,
  CreatedWorkspace,
  InviteMemberInput,
  WorkspaceInvitation,
  WorkspaceMember,
} from '@/lib/types/workspace-member';

function workspacePath(workspaceId: string, suffix: string) {
  return `/workspaces/${workspaceId}/${suffix}`;
}

export function listWorkspaceMembers(
  workspaceId: string,
): Promise<WorkspaceMember[]> {
  return apiFetch<WorkspaceMember[]>(workspacePath(workspaceId, 'members'));
}

export function listWorkspaceInvitations(
  workspaceId: string,
): Promise<WorkspaceInvitation[]> {
  return apiFetch<WorkspaceInvitation[]>(workspacePath(workspaceId, 'invitations'));
}

/** Sends the invitation email through Clerk and returns the new pending invitation. */
export function inviteWorkspaceMember(
  workspaceId: string,
  input: InviteMemberInput,
): Promise<WorkspaceInvitation> {
  return apiFetch<WorkspaceInvitation>(workspacePath(workspaceId, 'invitations'), {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

/** Revokes a pending invitation. Responds 204 with no body. */
export function revokeWorkspaceInvitation(
  workspaceId: string,
  invitationId: string,
): Promise<void> {
  return apiFetch<void>(workspacePath(workspaceId, `invitations/${invitationId}`), {
    method: 'DELETE',
  });
}

/** Removes a member from the workspace. Responds 204 with no body. */
export function removeWorkspaceMember(
  workspaceId: string,
  userId: string,
): Promise<void> {
  return apiFetch<void>(workspacePath(workspaceId, `members/${userId}`), {
    method: 'DELETE',
  });
}

/** Creates a workspace (a Clerk organization) with the caller as its first admin. */
export function createWorkspace(input: CreateWorkspaceInput): Promise<CreatedWorkspace> {
  return apiFetch<CreatedWorkspace>('/workspaces', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}
