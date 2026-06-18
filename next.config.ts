import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ['192.168.15.10', '192.168.15.32'],
  typescript: {
    ignoreBuildErrors: true,
  },
};

export default nextConfig;
