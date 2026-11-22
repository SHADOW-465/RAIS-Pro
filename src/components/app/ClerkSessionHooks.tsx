"use client";

import { useAuth, useClerk } from "@clerk/nextjs";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { registerClerkSignOut } from "@/lib/auth/clerk-sign-out-bridge";
import { shouldRedirectToNoAccess } from "@/lib/auth/clerk-session-ui";
import { usePersona } from "./PersonaContext";

/**
 * Clerk-only chrome: register sign-out with PersonaContext, and send a
 * signed-in Clerk user who has no MOID mapping to /no-access — but only
 * after /api/auth/me has run against an established Clerk session.
 */
export function ClerkSessionHooks({ enabled }: { enabled: boolean }) {
  if (!enabled) return null;
  return <ClerkSessionHooksInner />;
}

function ClerkSessionHooksInner() {
  const { signOut } = useClerk();
  const { isSignedIn, isLoaded, userId } = useAuth();
  const { authUser, authReady, refreshAuth } = usePersona();
  const pathname = usePathname();
  const router = useRouter();
  const [sessionChecked, setSessionChecked] = useState(false);
  const requestGen = useRef(0);

  useEffect(() => {
    registerClerkSignOut(() => signOut({ redirectUrl: "/login" }));
    return () => registerClerkSignOut(null);
  }, [signOut]);

  // Refetch /api/auth/me when Clerk reports a session (and once more on 401).
  // A first paint that raced the cookie must not be the last word.
  useEffect(() => {
    if (!isLoaded) return;
    if (!isSignedIn || !userId) {
      setSessionChecked(false);
      return;
    }
    const gen = ++requestGen.current;
    setSessionChecked(false);
    void (async () => {
      await refreshAuth({ retryOn401: true });
      if (requestGen.current === gen) setSessionChecked(true);
    })();
  }, [isLoaded, isSignedIn, userId, refreshAuth]);

  // A break-glass GM has a mapped cookie session but Clerk isSignedIn is
  // false — shouldRedirectToNoAccess already requires isSignedIn, so they
  // are not bounced to /no-access.
  useEffect(() => {
    if (
      shouldRedirectToNoAccess({
        isLoaded,
        authReady,
        sessionChecked,
        isSignedIn: !!isSignedIn,
        hasMappedUser: !!authUser,
        pathname,
      })
    ) {
      router.replace("/no-access");
    }
  }, [isLoaded, authReady, sessionChecked, isSignedIn, authUser, pathname, router]);

  return null;
}
