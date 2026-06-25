import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // On-prem appliance build. `standalone` makes `next build` emit a minimal,
  // self-contained server bundle under `.next/standalone` (server.js + only the
  // traced node_modules it actually needs). We ship THAT — not the repo, not
  // package.json, not src/. The shipped JS is bundled + minified (no comments,
  // mangled names): the baseline source-protection tier. See docs/DEPLOYMENT.md.
  output: "standalone",

  // Keep native/db packages out of the bundle so they're loaded from
  // node_modules at runtime (required for `pg`) and so the proprietary engine
  // can later be externalised + byte-compiled (Stage B). Harmless if a package
  // listed here isn't installed yet.
  serverExternalPackages: ["pg"],
};

export default nextConfig;
