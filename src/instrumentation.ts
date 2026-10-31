// Runs once when a server instance starts, before it accepts requests.
// A production server missing a required secret must not come up half-working
// (e.g. falling back to an in-memory ledger that loses every write), so the
// problems are logged and startup is aborted.

export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { isProductionRuntime, productionEnvProblems } = await import("@/lib/env");
  if (!isProductionRuntime()) return;
  const problems = productionEnvProblems();
  if (problems.length === 0) return;
  // eslint-disable-next-line no-console
  console.error(
    "[startup] Refusing to start — fix these environment variables and redeploy:\n" +
      problems.map((p) => `  - ${p}`).join("\n"),
  );
  throw new Error(`Invalid production environment: ${problems.join(" ")}`);
}
