import type { NextConfig } from "next";

const BACKEND_URL = process.env.BACKEND_URL ?? 'http://127.0.0.1:8000';

const nextConfig: NextConfig = {
  output: process.env.BUILD_STANDALONE === '1' ? 'standalone' : undefined,
  // Permite acesso de dispositivos na rede local (celular, outro PC)
  allowedDevOrigins: ['192.168.0.0/16', '10.0.0.0/8', '172.16.0.0/12'],
  async rewrites() {
    return [
      {
        source: "/api/v1/:path*",
        destination: `${BACKEND_URL}/api/v1/:path*`,
      },
    ];
  },
};

export default nextConfig;
