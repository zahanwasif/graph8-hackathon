import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';

import { AppSidebar } from '@/components/app-sidebar';
import { Separator } from '@/components/ui/separator';
import { SidebarInset, SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';

export default async function AppLayout({ children }: LayoutProps<'/'>) {
  // Signed out → Clerk redirects to /sign-in. Everything in the shell is workspace-scoped, so
  // with no active workspace — a brand-new user, or one whose last workspace was deleted —
  // send them to create or pick one.
  const { orgId } = await auth.protect();
  if (!orgId) redirect('/onboarding');

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset className="min-w-0">
        <header className="flex h-16 shrink-0 items-center gap-2 border-b px-4">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-2 data-[orientation=vertical]:h-4" />
        </header>
        <div className="flex min-w-0 flex-1 flex-col gap-4 p-4">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  );
}
