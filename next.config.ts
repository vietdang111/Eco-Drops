import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["better-sqlite3"],
  poweredByHeader: false,
  experimental: {
    typedEnv: true,
  },
};

export default nextConfig;
