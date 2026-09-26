'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useOrganization, useOrganizationList } from '@clerk/nextjs';
import { Check, ChevronsUpDown, Plus, Settings } from 'lucide-react';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Skeleton } from '@/components/ui/skeleton';
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem } from '@/components/ui/sidebar';
import { CreateWorkspaceDialog } from '@/components/workspaces/create-workspace-dialog';
import { cn } from '@/lib/utils';

/** First letter of the workspace name, for the square avatar's fallback. */
function initial(name: string): string {
  return name.trim().charAt(0).toUpperCase() || 'W';
}

/**
 * The square org mark. Sized to match the sidebar's brand tile so the collapsed rail lines
 * up — collapsed, the button shrinks to `size-8` with no padding and this is all that shows.
 */
function WorkspaceAvatar({
  name,
  imageUrl,
  className,
}: {
  name: string;
  imageUrl?: string | null;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex aspect-square size-8 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-sidebar-accent text-xs font-semibold text-sidebar-accent-foreground',
        className,
      )}
    >
      {imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- Clerk CDN URLs, not a local asset
        <img src={imageUrl} alt="" className="size-full object-cover" />
      ) : (
        initial(name)
      )}
    </div>
  );
}

/**
 * Our own workspace switcher, in place of Clerk's `<OrganizationSwitcher>`.
 *
 * Clerk still owns the organizations themselves — this reads the user's memberships from
 * `useOrganizationList()` and switches with `setActive()`. What it deliberately does not
 * carry is Clerk's popover: creating a workspace goes through our own dialog and API, and
 * workspace administration lives on our own `/workspace-settings` page.
 */
export function WorkspaceSwitcher() {
  const { organization, isLoaded: isOrgLoaded } = useOrganization();
  const {
    isLoaded: isListLoaded,
    setActive,
    userMemberships,
  } = useOrganizationList({
    userMemberships: { infinite: true, pageSize: 50 },
  });
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [switching, setSwitching] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);

  const memberships = userMemberships?.data ?? [];

  if (!isOrgLoaded) {
    return (
      <SidebarMenu>
        <SidebarMenuItem>
          <div className="flex h-12 items-center gap-2 px-2">
            <Skeleton className="size-8 shrink-0 rounded-lg" />
            <Skeleton className="h-4 flex-1 group-data-[collapsible=icon]:hidden" />
          </div>
        </SidebarMenuItem>
      </SidebarMenu>
    );
  }

  const activeName = organization?.name ?? 'No workspace';

  async function handleSelect(organizationId: string) {
    if (!setActive || organizationId === organization?.id) {
      setOpen(false);
      return;
    }
    setSwitching(true);
    try {
      await setActive({ organization: organizationId });
      setOpen(false);
      // Server components (the shell, the home page) read the active org — re-render them.
      router.refresh();
    } finally {
      setSwitching(false);
    }
  }

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu open={open} onOpenChange={setOpen}>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              size="lg"
              aria-label={`Workspace: ${activeName}. Switch workspace`}
              className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
            >
              <WorkspaceAvatar name={activeName} imageUrl={organization?.imageUrl} />
              <div className="grid flex-1 text-left text-sm leading-tight group-data-[collapsible=icon]:hidden">
                <span className="truncate font-medium">{activeName}</span>
                <span className="truncate text-xs text-muted-foreground">Workspace</span>
              </div>
              <ChevronsUpDown className="ml-auto opacity-60 group-data-[collapsible=icon]:hidden" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>

          <DropdownMenuContent
            align="start"
            side="bottom"
            sideOffset={4}
            className="w-(--radix-dropdown-menu-trigger-width) min-w-60"
          >
            <DropdownMenuLabel className="text-xs text-muted-foreground">
              Workspaces
            </DropdownMenuLabel>

            {!isListLoaded ? (
              <div className="space-y-1 p-1">
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-8 w-full" />
              </div>
            ) : memberships.length === 0 ? (
              <p className="px-2 py-3 text-xs text-muted-foreground">
                You&rsquo;re not a member of any workspace yet.
              </p>
            ) : (
              memberships.map((membership) => {
                const org = membership.organization;
                const isActive = org.id === organization?.id;
                return (
                  <DropdownMenuItem
                    key={org.id}
                    disabled={switching}
                    onSelect={(event) => {
                      // Keep the menu up until setActive resolves, so the row doesn't flash
                      // back to the old workspace on the way out.
                      event.preventDefault();
                      void handleSelect(org.id);
                    }}
                    className="gap-2"
                  >
                    <WorkspaceAvatar
                      name={org.name}
                      imageUrl={org.imageUrl}
                      className="size-6 rounded-md text-[10px]"
                    />
                    <span className="flex-1 truncate">{org.name}</span>
                    {isActive ? <Check className="size-4 text-primary" /> : null}
                  </DropdownMenuItem>
                );
              })
            )}

            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="gap-2"
              onSelect={() => {
                setOpen(false);
                setCreateOpen(true);
              }}
            >
              <Plus className="size-4" />
              Create workspace
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href="/workspace-settings" className="gap-2">
                <Settings className="size-4" />
                Workspace settings
              </Link>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <CreateWorkspaceDialog open={createOpen} onOpenChange={setCreateOpen} />
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
