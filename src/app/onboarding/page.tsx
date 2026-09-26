import { auth } from '@clerk/nextjs/server';

import { OnboardingClient } from '@/components/workspaces/onboarding-client';
import { pageTitle } from '@/lib/app-config';

export const metadata = { title: pageTitle('Create your workspace') };

export default async function OnboardingPage() {
  await auth.protect();
  return <OnboardingClient />;
}
