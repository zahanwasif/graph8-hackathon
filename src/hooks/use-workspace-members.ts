'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useOrganization } from '@clerk/nextjs';

import {
  inviteWorkspaceMember,
  listWorkspaceInvitations,
  listWorkspaceMembers,
  removeWorkspaceMember,
  revokeWorkspaceInvitation,
} from '@/lib/api/workspaces';
import type {
  InviteMemberInput,
  WorkspaceInvitation,
  WorkspaceMember,
} from '@/lib/types/workspace-member';

// ============ Query Keys ============
export const workspaceMemberKeys = {
  all: ['workspace-members'] as const,
  members: () => [...workspaceMemberKeys.all, 'members'] as const,
  memberList: (workspaceId: string) => [...workspaceMemberKeys.members(), workspaceId] as const,
  invitations: () => [...workspaceMemberKeys.all, 'invitations'] as const,
  invitationList: (workspaceId: string) =>
    [...workspaceMemberKeys.invitations(), workspaceId] as const,
};

// ============ Queries ============

/** Every member of the current workspace, oldest membership first. */
export function useWorkspaceMembers() {
  const { organization, isLoaded: isOrgLoaded } = useOrganization();
  const workspaceId = organization?.id;

  return useQuery({
    queryKey: workspaceMemberKeys.memberList(workspaceId!),
    queryFn: async (): Promise<WorkspaceMember[]> => {
      return listWorkspaceMembers(workspaceId!);
    },
    enabled: isOrgLoaded && !!workspaceId,
  });
}

/** Invitations that have been sent but not yet accepted, revoked, or expired. */
export function useWorkspaceInvitations() {
  const { organization, isLoaded: isOrgLoaded } = useOrganization();
  const workspaceId = organization?.id;

  return useQuery({
    queryKey: workspaceMemberKeys.invitationList(workspaceId!),
    queryFn: async (): Promise<WorkspaceInvitation[]> => {
      return listWorkspaceInvitations(workspaceId!);
    },
    enabled: isOrgLoaded && !!workspaceId,
  });
}

// ============ Mutations ============

/** Invites an email address. Admin-only on the backend. */
export function useInviteWorkspaceMember() {
  const { organization } = useOrganization();
  const workspaceId = organization?.id;
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: InviteMemberInput): Promise<WorkspaceInvitation> => {
      if (!workspaceId) throw new Error('No workspace selected');
      return inviteWorkspaceMember(workspaceId, input);
    },
    onSuccess: () => {
      if (workspaceId) {
        queryClient.invalidateQueries({
          queryKey: workspaceMemberKeys.invitationList(workspaceId),
        });
      }
    },
  });
}

/**
 * Revokes a pending invitation. Optimistically drops the row, rolls back on error, and
 * refetches on settle so a 404 (already gone) still reconciles.
 */
export function useRevokeWorkspaceInvitation() {
  const { organization } = useOrganization();
  const workspaceId = organization?.id;
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (invitationId: string): Promise<void> => {
      if (!workspaceId) throw new Error('No workspace selected');
      return revokeWorkspaceInvitation(workspaceId, invitationId);
    },
    onMutate: async (invitationId: string) => {
      if (!workspaceId) return { previous: undefined };
      const listKey = workspaceMemberKeys.invitationList(workspaceId);
      await queryClient.cancelQueries({ queryKey: listKey });
      const previous = queryClient.getQueryData<WorkspaceInvitation[]>(listKey);
      queryClient.setQueryData<WorkspaceInvitation[]>(listKey, (old) =>
        old ? old.filter((invitation) => invitation.id !== invitationId) : old,
      );
      return { previous };
    },
    onError: (_err, _invitationId, context) => {
      if (workspaceId && context?.previous) {
        queryClient.setQueryData(workspaceMemberKeys.invitationList(workspaceId), context.previous);
      }
    },
    onSettled: () => {
      if (workspaceId) {
        queryClient.invalidateQueries({
          queryKey: workspaceMemberKeys.invitationList(workspaceId),
        });
      }
    },
  });
}

/**
 * Removes a member. The backend refuses self-removal and removing the last admin, so the
 * optimistic drop can be reverted — hence the snapshot/rollback.
 */
export function useRemoveWorkspaceMember() {
  const { organization } = useOrganization();
  const workspaceId = organization?.id;
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (userId: string): Promise<void> => {
      if (!workspaceId) throw new Error('No workspace selected');
      return removeWorkspaceMember(workspaceId, userId);
    },
    onMutate: async (userId: string) => {
      if (!workspaceId) return { previous: undefined };
      const listKey = workspaceMemberKeys.memberList(workspaceId);
      await queryClient.cancelQueries({ queryKey: listKey });
      const previous = queryClient.getQueryData<WorkspaceMember[]>(listKey);
      queryClient.setQueryData<WorkspaceMember[]>(listKey, (old) =>
        old ? old.filter((member) => member.userId !== userId) : old,
      );
      return { previous };
    },
    onError: (_err, _userId, context) => {
      if (workspaceId && context?.previous) {
        queryClient.setQueryData(workspaceMemberKeys.memberList(workspaceId), context.previous);
      }
    },
    onSettled: () => {
      if (workspaceId) {
        queryClient.invalidateQueries({ queryKey: workspaceMemberKeys.memberList(workspaceId) });
      }
    },
  });
}
