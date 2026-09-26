'use client';

import { useState } from 'react';
import { useOrganization } from '@clerk/nextjs';
import { MailPlus, Trash2, UserPlus, Users } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { ConfirmActionDialog } from '@/components/confirm-action-dialog';
import { InviteMemberDialog } from '@/components/workspace-settings/invite-member-dialog';
import {
  useInviteWorkspaceMember,
  useRemoveWorkspaceMember,
  useRevokeWorkspaceInvitation,
  useWorkspaceInvitations,
  useWorkspaceMembers,
} from '@/hooks/use-workspace-members';
import { avatarColorStyle, initials } from '@/lib/avatar-color';
import { formatMemberDate, workspaceMemberErrorMessage } from '@/lib/workspace-members-format';
import {
  isAdminRole,
  memberDisplayName,
  roleLabel,
  type InviteMemberInput,
  type WorkspaceInvitation,
  type WorkspaceMember,
} from '@/lib/types/workspace-member';

const MEMBER_COLUMNS = 5;
const INVITATION_COLUMNS = 4;

function RoleBadge({ role }: { role: string }) {
  return <Badge variant={isAdminRole(role) ? 'info' : 'neutral'}>{roleLabel(role)}</Badge>;
}

function MemberAvatar({ member }: { member: WorkspaceMember }) {
  const name = memberDisplayName(member);

  if (member.imageUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- Clerk CDN URL, not a local asset
      <img src={member.imageUrl} alt="" className="size-8 shrink-0 rounded-full object-cover" />
    );
  }

  return (
    <span
      className="flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-medium"
      style={avatarColorStyle(name)}
      aria-hidden
    >
      {initials(name)}
    </span>
  );
}

function SkeletonRows({ columns }: { columns: number }) {
  return (
    <>
      {Array.from({ length: 3 }).map((_, row) => (
        <TableRow key={row} className="hover:bg-transparent">
          {Array.from({ length: columns }).map((__, cell) => (
            <TableCell key={cell} className="px-4 py-3">
              <Skeleton className="h-4 w-24" />
            </TableCell>
          ))}
        </TableRow>
      ))}
    </>
  );
}

/**
 * Workspace member management — the first-party replacement for Clerk's drop-in
 * organization UI. Clerk still holds the memberships; everything here goes through our own
 * `/workspaces/:id/members` and `/invitations` endpoints.
 *
 * Admin-only actions are hidden rather than disabled for non-admins: the backend refuses
 * them anyway, and a row of dead buttons reads as a bug. The one thing kept visible is the
 * banner explaining why there's nothing to click.
 */
export function WorkspaceMembersClient() {
  const { organization, membership, isLoaded: isOrgLoaded } = useOrganization();
  const workspaceId = organization?.id;
  const isAdmin = isAdminRole(membership?.role);

  const {
    data: members = [],
    isLoading: membersLoading,
    error: membersError,
  } = useWorkspaceMembers();
  const {
    data: invitations = [],
    isLoading: invitationsLoading,
    error: invitationsError,
  } = useWorkspaceInvitations();

  const inviteMutation = useInviteWorkspaceMember();
  const removeMutation = useRemoveWorkspaceMember();
  const revokeMutation = useRevokeWorkspaceInvitation();

  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [memberToRemove, setMemberToRemove] = useState<WorkspaceMember | null>(null);
  const [removeError, setRemoveError] = useState<string | null>(null);
  const [invitationToRevoke, setInvitationToRevoke] = useState<WorkspaceInvitation | null>(null);
  const [revokeError, setRevokeError] = useState<string | null>(null);

  async function handleInvite(input: InviteMemberInput) {
    setInviteError(null);
    try {
      await inviteMutation.mutateAsync(input);
      setInviteOpen(false);
    } catch (err) {
      setInviteError(workspaceMemberErrorMessage(err));
    }
  }

  async function handleRemove() {
    if (!memberToRemove) return;
    setRemoveError(null);
    try {
      await removeMutation.mutateAsync(memberToRemove.userId);
      setMemberToRemove(null);
    } catch (err) {
      setRemoveError(workspaceMemberErrorMessage(err));
    }
  }

  async function handleRevoke() {
    if (!invitationToRevoke) return;
    setRevokeError(null);
    try {
      await revokeMutation.mutateAsync(invitationToRevoke.id);
      setInvitationToRevoke(null);
    } catch (err) {
      setRevokeError(workspaceMemberErrorMessage(err));
    }
  }

  if (!isOrgLoaded) {
    return <p className="text-sm text-muted-foreground">Loading workspace…</p>;
  }

  if (!workspaceId) {
    return (
      <div className="space-y-6">
        <PageHeader title="Workspace settings" description="Manage who can use this workspace." />
        <EmptyState
          icon={<Users />}
          title="Select a workspace"
          description="Choose a workspace from the sidebar to manage its members."
        />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <PageHeader
        title="Workspace settings"
        description={`Manage who can use ${organization?.name ?? 'this workspace'}.`}
        actions={
          isAdmin ? (
            <Button
              variant="gradient"
              onClick={() => {
                setInviteError(null);
                setInviteOpen(true);
              }}
            >
              <UserPlus data-icon="inline-start" />
              Invite member
            </Button>
          ) : null
        }
      />

      {!isAdmin && (
        <div className="rounded-lg border border-info-border bg-info-bg px-4 py-3 text-sm text-info-fg">
          You&rsquo;re a member of this workspace. Only admins can invite or remove people.
        </div>
      )}

      <section className="space-y-3">
        <div>
          <h2 className="text-sm font-semibold">Members</h2>
          <p className="text-sm text-muted-foreground">Everyone with access to this workspace.</p>
        </div>

        {membersError && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {workspaceMemberErrorMessage(membersError)}
          </div>
        )}

        <div className="overflow-x-auto rounded-xl border border-border bg-card shadow-xs">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="px-4">Name</TableHead>
                <TableHead className="px-4">Email</TableHead>
                <TableHead className="px-4">Role</TableHead>
                <TableHead className="px-4">Joined</TableHead>
                <TableHead className="px-4 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {membersLoading ? (
                <SkeletonRows columns={MEMBER_COLUMNS} />
              ) : members.length === 0 ? (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={MEMBER_COLUMNS}>
                    <EmptyState
                      bordered={false}
                      icon={<Users />}
                      title="No members yet"
                      description="Invite someone to get started."
                    />
                  </TableCell>
                </TableRow>
              ) : (
                members.map((member) => {
                  const isSelf = member.userId === membership?.publicUserData?.userId;
                  return (
                    <TableRow key={member.id}>
                      <TableCell className="px-4 py-3">
                        <div className="flex items-center gap-2.5">
                          <MemberAvatar member={member} />
                          <span className="font-medium">{memberDisplayName(member)}</span>
                          {isSelf ? (
                            <span className="text-xs text-muted-foreground">(you)</span>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell className="px-4 py-3 text-muted-foreground">
                        {member.email ?? '—'}
                      </TableCell>
                      <TableCell className="px-4 py-3">
                        <RoleBadge role={member.role} />
                      </TableCell>
                      <TableCell className="px-4 py-3 text-muted-foreground">
                        {formatMemberDate(member.joinedAt)}
                      </TableCell>
                      <TableCell className="px-4 py-3">
                        <div className="flex justify-end">
                          {isAdmin && !isSelf ? (
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              onClick={() => {
                                setRemoveError(null);
                                setMemberToRemove(member);
                              }}
                              aria-label={`Remove ${memberDisplayName(member)}`}
                            >
                              <Trash2 className="text-destructive" />
                            </Button>
                          ) : isAdmin && isSelf ? (
                            <Tooltip>
                              <TooltipTrigger
                                render={
                                  <Button variant="ghost" size="icon-sm" disabled>
                                    <Trash2 />
                                  </Button>
                                }
                              />
                              <TooltipContent>You can&rsquo;t remove yourself</TooltipContent>
                            </Tooltip>
                          ) : null}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="text-sm font-semibold">Pending invitations</h2>
          <p className="text-sm text-muted-foreground">
            Invitations that have been sent but not accepted yet.
          </p>
        </div>

        {invitationsError && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {workspaceMemberErrorMessage(invitationsError)}
          </div>
        )}

        <div className="overflow-x-auto rounded-xl border border-border bg-card shadow-xs">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="px-4">Email</TableHead>
                <TableHead className="px-4">Role</TableHead>
                <TableHead className="px-4">Invited</TableHead>
                <TableHead className="px-4 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {invitationsLoading ? (
                <SkeletonRows columns={INVITATION_COLUMNS} />
              ) : invitations.length === 0 ? (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={INVITATION_COLUMNS}>
                    <EmptyState
                      bordered={false}
                      icon={<MailPlus />}
                      title="No pending invitations"
                      description="Invitations you send will appear here until they're accepted."
                    />
                  </TableCell>
                </TableRow>
              ) : (
                invitations.map((invitation) => (
                  <TableRow key={invitation.id}>
                    <TableCell className="px-4 py-3 font-medium">{invitation.email}</TableCell>
                    <TableCell className="px-4 py-3">
                      <RoleBadge role={invitation.role} />
                    </TableCell>
                    <TableCell className="px-4 py-3 text-muted-foreground">
                      {formatMemberDate(invitation.createdAt)}
                    </TableCell>
                    <TableCell className="px-4 py-3">
                      <div className="flex justify-end">
                        {isAdmin ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setRevokeError(null);
                              setInvitationToRevoke(invitation);
                            }}
                          >
                            Revoke
                          </Button>
                        ) : null}
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </section>

      <InviteMemberDialog
        open={inviteOpen}
        onOpenChange={(open) => {
          if (!inviteMutation.isPending) setInviteOpen(open);
        }}
        onSubmit={handleInvite}
        isSubmitting={inviteMutation.isPending}
        error={inviteError}
      />

      <ConfirmActionDialog
        open={!!memberToRemove}
        onOpenChange={(open) => {
          if (!open && !removeMutation.isPending) setMemberToRemove(null);
        }}
        title="Remove member?"
        description={
          <>
            <span className="font-medium text-foreground">
              {memberToRemove ? memberDisplayName(memberToRemove) : ''}
            </span>{' '}
            loses access to this workspace immediately. You can invite them again later.
          </>
        }
        confirmLabel="Remove member"
        pendingLabel="Removing…"
        onConfirm={handleRemove}
        isPending={removeMutation.isPending}
        error={removeError}
      />

      <ConfirmActionDialog
        open={!!invitationToRevoke}
        onOpenChange={(open) => {
          if (!open && !revokeMutation.isPending) setInvitationToRevoke(null);
        }}
        title="Revoke invitation?"
        description={
          <>
            The invitation to{' '}
            <span className="font-medium text-foreground">{invitationToRevoke?.email}</span> stops
            working. They won&rsquo;t be able to join with the link they were sent.
          </>
        }
        confirmLabel="Revoke invitation"
        pendingLabel="Revoking…"
        onConfirm={handleRevoke}
        isPending={revokeMutation.isPending}
        error={revokeError}
      />
    </div>
  );
}
