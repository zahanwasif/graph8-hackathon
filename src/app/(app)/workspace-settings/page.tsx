import { Suspense } from 'react';

import { LoadingState } from '@/components/ui/loading-state';
import { WorkspaceMembersClient } from '@/components/workspace-settings/workspace-members-client';
import { pageTitle } from '@/lib/app-config';

export const metadata = { title: pageTitle('Workspace settings') };

export default function WorkspaceSettingsPage() {
  return (
    <Suspense fallback={<LoadingState label="Loading workspace settings…" />}>
      <WorkspaceMembersClient />
    </Suspense>
  );
}
