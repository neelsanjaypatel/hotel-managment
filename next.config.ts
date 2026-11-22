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
  // Browser-side protections on every response: https only for a year, no framing by other
  // sites (clickjacking), no content-type guessing, and no full URLs leaked to other sites.
  headers: async () => [
    {
      source: "/:path*",
      headers: [
        { key: "Strict-Transport-Security", value: "max-age=31536000" },
        { key: "X-Frame-Options", value: "DENY" },
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      ],
    },
  ],
  serverExternalPackages: ["@electric-sql/pglite", "nodemailer"],
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
