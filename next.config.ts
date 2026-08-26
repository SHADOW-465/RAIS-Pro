import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Plant / Docker image: copy only the standalone server + static assets.
  output: "standalone",
  // Tree-shake large packages that ship multi-entry barrels (faster cold parse).
  experimental: {
    optimizePackageImports: ["zod", "ai"],
  },
  // Compress responses when not behind a CDN that already does gzip.
  compress: true,
  // Don't ship source maps to the browser in production.
  productionBrowserSourceMaps: false,
  // Prefer modularize imports for icon-less design system.
  poweredByHeader: false,
};

export default nextConfig;
