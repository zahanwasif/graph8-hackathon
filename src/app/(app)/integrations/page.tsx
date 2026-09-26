import { Suspense } from 'react';

import { IntegrationsClient } from '@/components/integrations/integrations-client';
import { LoadingState } from '@/components/ui/loading-state';
import { pageTitle } from '@/lib/app-config';

export const metadata = { title: pageTitle('Integrations') };

export default function IntegrationsPage() {
  return (
    <Suspense fallback={<LoadingState label="Loading integrations…" />}>
      <IntegrationsClient />
    </Suspense>
  );
}
