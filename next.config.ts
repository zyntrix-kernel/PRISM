import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",
  images: {
    unoptimized: true,
  },
  reactStrictMode: false,
  devIndicators: false,
  poweredByHeader: false,
};

export default nextConfig;
