import { clerkMiddleware } from '@clerk/nextjs/server';

/**
 * Clerk's middleware (Next 16 calls the file `proxy.ts`) — not an API proxy.
 *
 * It only attaches the session; it does not decide who may see what. Access is checked where
 * the data is: `src/app/(app)/layout.tsx` and the onboarding page call `auth.protect()`, and
 * every API route goes through `requireUser` / `requireWorkspace` / `requireAdmin`
 * (`src/server/auth.ts`). Path-matching auth in middleware is deprecated by Clerk because it
 * can drift from how Next actually routes a request.
 */
export default clerkMiddleware();

export const config = {
  matcher: [
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    '/(api|trpc)(.*)',
  ],
};
