import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'export',
  typescript: {
    ignoreBuildErrors: true,
  },
  env: {
    BACKEND_URL: process.env.NEXT_PUBLIC_BACKEND_URL || '',
  },
};

export default nextConfig;
