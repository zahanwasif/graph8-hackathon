import 'server-only';

import { clerkClient } from '@clerk/nextjs/server';

import { ADMIN_ROLE, type WorkspaceRole } from '@/server/auth';
import { toClerkHttpError } from '@/server/clerk-error';
import { badRequest, forbidden, notFound } from '@/server/http';
import type {
  CreatedWorkspace,
  WorkspaceInvitation,
  WorkspaceMember,
} from '@/lib/types/workspace-member';

/**
 * Workspace management, backed by Clerk organizations. Ported from the Veleads backend's
 * `WorkspacesService` / `WorkspaceMembersService`.
 *
 * Clerk stays the source of truth for who belongs to a workspace — this module exists so the
 * dashboard can read and change membership through our own API (and our own role checks)
 * instead of embedding Clerk's drop-in organization UI.
 */

/**
 * Page through memberships in chunks, but stop at this many so a pathologically large
 * org can never stall a request. Well above any plausible workspace size.
 */
const PAGE_SIZE = 100;
const MAX_MEMBERS = 1000;

type Clerk = Awaited<ReturnType<typeof clerkClient>>;
type MembershipPage = Awaited<ReturnType<Clerk['organizations']['getOrganizationMembershipList']>>;
type Membership = MembershipPage['data'][number];

/** Creates a workspace. `createdBy` is what makes the creator its first admin. */
export async function createWorkspace(userId: string, name: string): Promise<CreatedWorkspace> {
  const clerk = await clerkClient();
  try {
    const org = await clerk.organizations.createOrganization({ name, createdBy: userId });
    return { id: org.id, name: org.name };
  } catch (error) {
    throw toClerkHttpError('create workspace', error);
  }
}

export async function renameWorkspace(workspaceId: string, name: string): Promise<CreatedWorkspace> {
  const clerk = await clerkClient();
  try {
    const org = await clerk.organizations.updateOrganization(workspaceId, { name });
    return { id: org.id, name: org.name };
  } catch (error) {
    throw toClerkHttpError('rename workspace', error, 'Workspace not found');
  }
}

/** Lists every member of the workspace, oldest membership first. */
export async function listMembers(workspaceId: string): Promise<WorkspaceMember[]> {
  const memberships = await fetchAllMemberships(workspaceId);
  return memberships.map(toMember);
}

/** Lists the workspace's invitations that are still outstanding. */
export async function listInvitations(workspaceId: string): Promise<WorkspaceInvitation[]> {
  const clerk = await clerkClient();
  try {
    const { data } = await clerk.organizations.getOrganizationInvitationList({
      organizationId: workspaceId,
      status: ['pending'],
      limit: PAGE_SIZE,
    });
    return data.map(toInvitation);
  } catch (error) {
    throw toClerkHttpError('list invitations', error);
  }
}

/**
 * Invites an email address to the workspace. Clerk sends the email; the invitation stays
 * pending until it is accepted, revoked, or expires.
 */
export async function inviteMember(
  workspaceId: string,
  inviterUserId: string,
  input: { emailAddress: string; role: WorkspaceRole },
): Promise<WorkspaceInvitation> {
  const emailAddress = input.emailAddress.trim().toLowerCase();

  // Clerk rejects this too, but with an opaque 4xx — check first so the dashboard has a
  // message it can show verbatim.
  const memberships = await fetchAllMemberships(workspaceId);
  if (memberships.some((m) => m.publicUserData?.identifier?.toLowerCase() === emailAddress)) {
    throw badRequest(`${emailAddress} is already a member of this workspace`);
  }

  const clerk = await clerkClient();
  try {
    const invitation = await clerk.organizations.createOrganizationInvitation({
      organizationId: workspaceId,
      emailAddress,
      role: input.role,
      inviterUserId,
      // Land invitees back in this app rather than on Clerk's hosted pages.
      ...(process.env.NEXT_PUBLIC_APP_URL
        ? { redirectUrl: `${process.env.NEXT_PUBLIC_APP_URL}/sign-up` }
        : {}),
    });
    return toInvitation(invitation);
  } catch (error) {
    throw toClerkHttpError('invite member', error);
  }
}

/** Revokes a pending invitation. */
export async function revokeInvitation(
  workspaceId: string,
  invitationId: string,
  requestingUserId: string,
): Promise<void> {
  const clerk = await clerkClient();
  try {
    await clerk.organizations.revokeOrganizationInvitation({
      organizationId: workspaceId,
      invitationId,
      requestingUserId,
    });
  } catch (error) {
    throw toClerkHttpError('revoke invitation', error, `Invitation ${invitationId} not found`);
  }
}

/**
 * Removes a member from the workspace.
 *
 * Two ways to lock a workspace out that Clerk's API would happily allow, both refused
 * here: removing yourself (that's "leave workspace", which this surface doesn't offer),
 * and removing the workspace's last admin.
 */
export async function removeMember(
  workspaceId: string,
  userId: string,
  requestingUserId: string,
): Promise<void> {
  if (userId === requestingUserId) {
    throw forbidden('You cannot remove yourself from the workspace. Ask another admin to do it.');
  }

  const memberships = await fetchAllMemberships(workspaceId);
  const target = memberships.find((m) => m.publicUserData?.userId === userId);
  if (!target) {
    throw notFound(`User ${userId} is not a member of this workspace`);
  }

  if (target.role === ADMIN_ROLE) {
    const admins = memberships.filter((m) => m.role === ADMIN_ROLE);
    if (admins.length <= 1) {
      throw forbidden('You cannot remove the last admin. Promote another member to admin first.');
    }
  }

  const clerk = await clerkClient();
  try {
    await clerk.organizations.deleteOrganizationMembership({ organizationId: workspaceId, userId });
  } catch (error) {
    throw toClerkHttpError('remove member', error, `User ${userId} is not a member`);
  }
}

/** Pages through the workspace's memberships, oldest first, up to {@link MAX_MEMBERS}. */
async function fetchAllMemberships(workspaceId: string): Promise<Membership[]> {
  const clerk = await clerkClient();
  const all: Membership[] = [];

  for (let offset = 0; offset < MAX_MEMBERS; offset += PAGE_SIZE) {
    let page: MembershipPage;
    try {
      page = await clerk.organizations.getOrganizationMembershipList({
        organizationId: workspaceId,
        limit: PAGE_SIZE,
        offset,
        orderBy: '+created_at',
      });
    } catch (error) {
      throw toClerkHttpError('list members', error);
    }

    all.push(...page.data);
    if (page.data.length < PAGE_SIZE) break;
  }

  return all;
}

function toMember(membership: Membership): WorkspaceMember {
  const user = membership.publicUserData;
  const name = [user?.firstName, user?.lastName].filter(Boolean).join(' ').trim();

  return {
    id: membership.id,
    userId: user?.userId ?? '',
    name: name || null,
    email: user?.identifier ?? null,
    imageUrl: user?.imageUrl ?? null,
    role: membership.role,
    joinedAt: membership.createdAt,
  };
}

function toInvitation(invitation: {
  id: string;
  emailAddress: string;
  role: string;
  status?: string;
  createdAt: number;
  expiresAt: number;
}): WorkspaceInvitation {
  return {
    id: invitation.id,
    email: invitation.emailAddress,
    role: invitation.role,
    status: invitation.status ?? 'pending',
    createdAt: invitation.createdAt,
    expiresAt: invitation.expiresAt,
  };
}
