import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Every page here reads live accounting data per user; nothing is prerendered.
  cacheComponents: false,
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
