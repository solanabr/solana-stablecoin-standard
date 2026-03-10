import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Use webpack explicitly (needed for Anchor/Solana polyfills)
  turbopack: {},
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        net: false,
        tls: false,
        crypto: false,
        stream: false,
        path: false,
        os: false,
        zlib: false,
      };
    }
    return config;
  },
};

export default nextConfig;
