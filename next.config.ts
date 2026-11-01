import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Every page here reads live accounting data per user; nothing is prerendered.
  cacheComponents: false,
  // Public photos are already small webp files; serving them as they are skips the delay and the free plan's image quota.
  images: { unoptimized: true },
  // Visitors without a session see the welcome page at the site's root; logged-in staff get the
  // dashboard. Here rather than in a proxy, which behind Caddy would refetch this server over https.
  rewrites: async () => ({
    beforeFiles: [{ source: "/", missing: [{ type: "cookie", key: "hm_session" }], destination: "/welcome" }],
    afterFiles: [],
    fallback: [],
  }),
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
