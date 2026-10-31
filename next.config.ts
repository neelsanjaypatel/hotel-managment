import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Every page here reads live accounting data per user; nothing is prerendered.
  cacheComponents: false,
  // Public photos are already small webp files; serving them as they are skips the delay and the free plan's image quota.
  images: { unoptimized: true },
  serverExternalPackages: ["@electric-sql/pglite"],
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
