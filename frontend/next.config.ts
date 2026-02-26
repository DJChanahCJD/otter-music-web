import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'export',
  typescript: {
    ignoreBuildErrors: true,
  },
  env: {
    // TODO: 在根目录添加 .env.local 文件，定义 NEXT_PUBLIC_BACKEND_URL 环境变量
    BACKEND_URL: process.env.NEXT_PUBLIC_BACKEND_URL || '',
  },
};

export default nextConfig;
