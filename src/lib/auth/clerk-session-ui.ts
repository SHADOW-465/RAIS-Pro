// Decisions for the Clerk session chrome. Kept pure so the race on
// /no-access can be tested without a browser.

export function isAuthExemptPath(pathname: string): boolean {
  return pathname === "/login" || pathname.startsWith("/login/") || pathname === "/no-access";
}

/**
 * Send a signed-in Clerk user to /no-access only after /api/auth/me has been
 * fetched *with* a Clerk session (and retried once on 401). A pre-session 401
 * must not stick them there.
 */
export function shouldRedirectToNoAccess(input: {
  isLoaded: boolean;
  authReady: boolean;
  sessionChecked: boolean;
  isSignedIn: boolean;
  hasMappedUser: boolean;
  pathname: string;
}): boolean {
  if (!input.isLoaded || !input.authReady || !input.sessionChecked) return false;
  if (isAuthExemptPath(input.pathname)) return false;
  return input.isSignedIn && !input.hasMappedUser;
}

/** Safe in-app destination when a mapped user is sitting on /no-access. */
export function homeAfterAccessGranted(homeHref?: string | null): string {
  if (!homeHref) return "/";
  const href = homeHref.trim();
  if (!href.startsWith("/") || href.startsWith("//") || href.startsWith("/\\")) return "/";
  return href;
}
