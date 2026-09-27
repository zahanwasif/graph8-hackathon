import { Suspense } from 'react';

import { MessagesClient } from '@/components/messages/messages-client';
import { LoadingState } from '@/components/ui/loading-state';
import { pageTitle } from '@/lib/app-config';

export const metadata = { title: pageTitle('Messages') };

export default function MessagesPage() {
  return (
    <Suspense fallback={<LoadingState label="Loading messages…" />}>
      <MessagesClient />
    </Suspense>
  );
}
