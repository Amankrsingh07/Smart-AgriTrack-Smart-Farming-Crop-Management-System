import path from "node:path";
import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const nextConfig: NextConfig = {
  // Keep dev HMR files isolated so a production build cannot replace them.
  distDir: process.env.NODE_ENV === "development" ? ".next-dev" : ".next",
  outputFileTracingRoot: path.resolve(process.cwd()),
  webpack(config, { dev }) {
    // The dev filesystem cache repeatedly fails to snapshot this project's
    // resolver dependencies and can leave HMR with stale module references.
    // Keep production caching enabled; development can recompile from source.
    if (dev) config.cache = false;
    return config;
  },
};

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

export default withNextIntl(nextConfig);
