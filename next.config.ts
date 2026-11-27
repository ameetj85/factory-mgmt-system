import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  experimental: {
    authInterrupts: true,
  },
  // @libsql/client and its native libsql bindings are already external by default in Next.js.
  serverExternalPackages: ["nodemailer"],
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
