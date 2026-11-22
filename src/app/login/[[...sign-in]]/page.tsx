import { isClerkAuth } from "@/lib/auth/provider";
import { isBreakGlassEnabled } from "@/lib/auth/break-glass";
import { clerkLoginMode } from "@/lib/auth/clerk-login-mode";
import { ClerkSignIn } from "../ClerkSignIn";
import { LegacyLoginForm } from "../LegacyLoginForm";

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{
    next?: string;
    __clerk_ticket?: string | string[];
    __clerk_status?: string | string[];
  }>;
}) {
  const params = await searchParams;
  if (isClerkAuth()) {
    return (
      <ClerkSignIn
        nextPath={params.next}
        mode={clerkLoginMode(params)}
        usernameLogin={isBreakGlassEnabled()}
      />
    );
  }
  return <LegacyLoginForm />;
}
