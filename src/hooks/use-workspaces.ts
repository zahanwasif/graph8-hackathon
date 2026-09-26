'use client';

import { useMutation } from '@tanstack/react-query';
import { useOrganizationList } from '@clerk/nextjs';

import { createWorkspace } from '@/lib/api/workspaces';
import type { CreateWorkspaceInput, CreatedWorkspace } from '@/lib/types/workspace-member';

/**
 * Creates a workspace and makes it the active one. Switching is part of the mutation because
 * every workspace-scoped query keys off the active Clerk org — a new workspace you aren't in
 * yet would leave the dashboard showing the old one.
 */
export function useCreateWorkspace() {
  const { setActive, userMemberships } = useOrganizationList({
    userMemberships: { infinite: true, pageSize: 50 },
  });

  return useMutation({
    mutationFn: async (input: CreateWorkspaceInput): Promise<CreatedWorkspace> => {
      const workspace = await createWorkspace(input);
      await setActive?.({ organization: workspace.id });
      await userMemberships?.revalidate?.();
      return workspace;
    },
  });
}
