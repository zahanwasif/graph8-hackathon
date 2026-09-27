import { Suspense } from 'react';

import { EventsClient } from '@/components/events/events-client';
import { LoadingState } from '@/components/ui/loading-state';
import { pageTitle } from '@/lib/app-config';

export const metadata = { title: pageTitle('Events') };

export default function EventsPage() {
  return (
    <Suspense fallback={<LoadingState label="Loading events…" />}>
      <EventsClient />
    </Suspense>
  );
}
