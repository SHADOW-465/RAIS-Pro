import { execSync } from "node:child_process";
import type { NextConfig } from "next";
import { LEGACY_ROUTES } from "./src/lib/nav-keys";

// One id per build, shared by Next's own build id and the client bundle
// (NEXT_PUBLIC_BUILD_ID), so an open tab can ask /api/version whether it is
// still on the current deploy. Order: explicit override, Vercel commit,
// Vercel deployment id, git HEAD, then a timestamp pinned in the environment so
// every build worker sees the same value.
function resolveBuildId(): string {
  const fromEnv =
    process.env.MOID_BUILD_ID || process.env.VERCEL_GIT_COMMIT_SHA || process.env.VERCEL_DEPLOYMENT_ID;
  if (fromEnv) return fromEnv;
  try {
    const sha = execSync("git rev-parse HEAD", { stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
    if (sha) return sha;
  } catch {
    /* no git (Docker context): fall through */
  }
  process.env.MOID_BUILD_ID = String(Date.now());
  return process.env.MOID_BUILD_ID;
}

const BUILD_ID = resolveBuildId();

const nextConfig: NextConfig = {
  generateBuildId: async () => BUILD_ID,
  env: { NEXT_PUBLIC_BUILD_ID: BUILD_ID },
  // Plant / Docker image: copy only the standalone server + static assets.
  output: "standalone",
  // Tree-shake large packages that ship multi-entry barrels (faster cold parse).
  experimental: {
    optimizePackageImports: ["zod", "ai"],
  },
  // Pre-regroup URLs (21 screens) forward to their new tab. Temporary (307) so
  // a later tab rename never gets stuck in a browser cache. Sub-paths follow
  // (/settings/rules); query strings are carried by Next.
  async redirects() {
    return Object.entries(LEGACY_ROUTES).flatMap(([from, to]) => [
      { source: from, destination: to, permanent: false },
      { source: `${from}/:path+`, destination: `${to}/:path+`, permanent: false },
    ]);
  },
  // Compress responses when not behind a CDN that already does gzip.
  compress: true,
  // Don't ship source maps to the browser in production.
  productionBrowserSourceMaps: false,
  // Prefer modularize imports for icon-less design system.
  poweredByHeader: false,
};

export default nextConfig;
