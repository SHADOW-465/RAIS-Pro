"use client";

import { useAuth, useClerk } from "@clerk/nextjs";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { registerClerkSignOut } from "@/lib/auth/clerk-sign-out-bridge";
import { usePersona } from "./PersonaContext";

/**
 * Clerk-only chrome: register sign-out with PersonaContext, and send a
 * signed-in Clerk user who has no MOID mapping to /no-access.
 */
export function ClerkSessionHooks({ enabled }: { enabled: boolean }) {
  if (!enabled) return null;
  return <ClerkSessionHooksInner />;
}

function ClerkSessionHooksInner() {
  const { signOut } = useClerk();
  const { isSignedIn, isLoaded } = useAuth();
  const { authUser, authReady } = usePersona();
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    registerClerkSignOut(() => signOut({ redirectUrl: "/login" }));
    return () => registerClerkSignOut(null);
  }, [signOut]);

  useEffect(() => {
    if (!isLoaded || !authReady) return;
    if (pathname === "/login" || pathname.startsWith("/login/") || pathname === "/no-access") {
      return;
    }
    if (isSignedIn && !authUser) {
      router.replace("/no-access");
    }
  }, [isLoaded, authReady, isSignedIn, authUser, pathname, router]);

  return null;
}
