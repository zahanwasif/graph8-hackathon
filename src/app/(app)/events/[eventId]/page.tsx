import { Suspense } from 'react';

import { EventDetailClient } from '@/components/events/event-detail-client';
import { LoadingState } from '@/components/ui/loading-state';
import { pageTitle } from '@/lib/app-config';

export const metadata = { title: pageTitle('Event') };

export default async function EventDetailPage({
  params,
}: {
  params: Promise<{ eventId: string }>;
}) {
  const { eventId } = await params;
  return (
    <Suspense fallback={<LoadingState label="Loading event…" />}>
      <EventDetailClient eventId={eventId} />
    </Suspense>
  );
}
