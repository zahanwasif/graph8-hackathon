'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { UserButton, useOrganizationList } from '@clerk/nextjs';
import { ChevronRight } from 'lucide-react';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { CreateWorkspaceForm } from '@/components/workspaces/create-workspace-form';
import { APP_MARK, APP_NAME } from '@/lib/app-config';
import { clerkSidebarAppearance } from '@/lib/clerk-appearance';

/**
 * Where the app shell sends anyone with no active workspace. A brand-new user creates their
 * first one; someone who already belongs to workspaces (say, via an accepted invitation) can
 * pick one instead.
 */
export function OnboardingClient() {
  const router = useRouter();
  const { isLoaded, setActive, userMemberships } = useOrganizationList({
    userMemberships: { infinite: true, pageSize: 50 },
  });
  const [switchingTo, setSwitchingTo] = useState<string | null>(null);

  const memberships = userMemberships?.data ?? [];

  function enterApp() {
    router.push('/');
    router.refresh();
  }

  async function handlePick(organizationId: string) {
    if (!setActive) return;
    setSwitchingTo(organizationId);
    try {
      await setActive({ organization: organizationId });
      enterApp();
    } finally {
      setSwitchingTo(null);
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-background p-4">
      <div className="absolute top-4 right-4">
        <UserButton appearance={clerkSidebarAppearance} />
      </div>

      <div className="w-full max-w-md space-y-6">
        <div className="flex items-center justify-center gap-2">
          <div className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <span className="text-sm font-semibold">{APP_MARK}</span>
          </div>
          <span className="font-semibold">{APP_NAME}</span>
        </div>

        {!isLoaded ? (
          <Skeleton className="h-64 rounded-xl" />
        ) : (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">
                {memberships.length ? 'Choose a workspace' : 'Create your workspace'}
              </CardTitle>
              <CardDescription>
                {memberships.length
                  ? 'Pick up where your team is, or start a new workspace.'
                  : 'Workspaces hold your team and your integrations. You can create more later.'}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {memberships.length ? (
                <>
                  <ul className="space-y-1">
                    {memberships.map(({ organization: org }) => (
                      <li key={org.id}>
                        <button
                          type="button"
                          disabled={switchingTo !== null}
                          onClick={() => void handlePick(org.id)}
                          className="flex w-full items-center gap-3 rounded-lg border border-border px-3 py-2 text-left text-sm transition-colors hover:bg-accent disabled:opacity-60"
                        >
                          <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-sidebar-accent text-xs font-semibold text-sidebar-accent-foreground">
                            {org.name.charAt(0).toUpperCase()}
                          </span>
                          <span className="flex-1 truncate font-medium">{org.name}</span>
                          {switchingTo === org.id ? (
                            <span className="text-xs text-muted-foreground">Opening…</span>
                          ) : (
                            <ChevronRight className="size-4 text-muted-foreground" />
                          )}
                        </button>
                      </li>
                    ))}
                  </ul>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <Separator className="flex-1" />
                    or create a new one
                    <Separator className="flex-1" />
                  </div>
                </>
              ) : null}
              <CreateWorkspaceForm onCreated={enterApp} />
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
