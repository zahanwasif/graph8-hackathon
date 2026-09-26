import { Suspense } from 'react';

import { HomeClient } from '@/components/home/home-client';
import { LoadingState } from '@/components/ui/loading-state';
import { pageTitle } from '@/lib/app-config';

export const metadata = { title: pageTitle('Home') };

export default function HomePage() {
  return (
    <Suspense fallback={<LoadingState label="Loading workspace…" />}>
      <HomeClient />
    </Suspense>
  );
}
