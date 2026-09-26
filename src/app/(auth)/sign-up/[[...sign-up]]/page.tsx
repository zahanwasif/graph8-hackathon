import { SignUp } from '@clerk/nextjs';

import { clerkAuthAppearance } from '@/lib/clerk-appearance';

export default function SignUpPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <SignUp appearance={clerkAuthAppearance} />
    </div>
  );
}
