// Startup environment validation. Edge-safe: no node imports, so the proxy,
// route handlers and instrumentation.ts can all share it.
//
// "Production" here means a running production server. `next build` also sets
// NODE_ENV=production, but nothing is serving requests then, and failing the
// build because a runtime secret is only configured on the host would just
// make the app impossible to deploy.

export function isProductionRuntime(): boolean {
  return (
    process.env.NODE_ENV === "production" &&
    process.env.NEXT_PHASE !== "phase-production-build"
  );
}

const MIN_SECRET_LEN = 16;

/** Why sessions cannot be signed safely, or null when they can (always null
 *  outside production, where a dev-only fallback key is allowed). */
export function authSecretProblem(): string | null {
  if (!isProductionRuntime()) return null;
  if ((process.env.MOID_AUTH_SECRET ?? "").trim().length >= MIN_SECRET_LEN) return null;
  return (
    `MOID_AUTH_SECRET is not set (or shorter than ${MIN_SECRET_LEN} characters). ` +
    "Refusing to run: without it anyone could forge a signed session. " +
    "Set it in the host's environment variables and redeploy."
  );
}

/** Everything a production server must have to run. Empty = fine. */
export function productionEnvProblems(): string[] {
  const problems: string[] = [];
  const auth = authSecretProblem();
  if (auth) problems.push(auth);

  const memory = (process.env.MOID_STORE ?? "").toLowerCase() === "memory";
  if (!memory) {
    if (!(process.env.SUPABASE_INTERNAL_URL || process.env.NEXT_PUBLIC_SUPABASE_URL)) {
      problems.push("NEXT_PUBLIC_SUPABASE_URL is not set.");
    }
    if (!(process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").trim()) {
      problems.push(
        "SUPABASE_SERVICE_ROLE_KEY is not set. The server never falls back to the anon key.",
      );
    }
  }
  return problems;
}
