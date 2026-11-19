// Which sign-in system is live.
//
// Clerk is opt-in. AUTH_PROVIDER=clerk only takes effect when both Clerk keys
// are present; otherwise the existing username/password login stays in place.
// That is deliberate: a missing key must never take a plant off its own app,
// and the existing test suite must keep passing with no Clerk env at all.

export type AuthProvider = "clerk" | "legacy";

export function clerkKeysPresent(): boolean {
  const pub = (process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ?? "").trim();
  const sec = (process.env.CLERK_SECRET_KEY ?? "").trim();
  return pub.length > 0 && sec.length > 0;
}

/** Live provider, read at call time so tests can flip the env. */
export function getAuthProvider(): AuthProvider {
  const raw = (process.env.AUTH_PROVIDER ?? "").trim().toLowerCase();
  if (raw === "clerk" && clerkKeysPresent()) return "clerk";
  return "legacy";
}

export function isClerkAuth(): boolean {
  return getAuthProvider() === "clerk";
}
