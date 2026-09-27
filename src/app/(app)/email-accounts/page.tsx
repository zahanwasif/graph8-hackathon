import { Suspense } from 'react';

import { EmailAccountsClient } from '@/components/email-accounts/email-accounts-client';
import { LoadingState } from '@/components/ui/loading-state';
import { pageTitle } from '@/lib/app-config';

export const metadata = { title: pageTitle('Email accounts') };

export default function EmailAccountsPage() {
  return (
    <Suspense fallback={<LoadingState label="Loading email accounts…" />}>
      <EmailAccountsClient />
    </Suspense>
  );
}
