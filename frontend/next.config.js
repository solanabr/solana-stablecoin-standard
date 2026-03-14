/** @type {import('next').NextConfig} */
const path = require('path');

const nextConfig = {
  reactStrictMode: true,
  output: 'standalone',
  images: {
    domains: ['arweave.net', 'www.arweave.net'],
  },
  webpack: (config, { webpack }) => {
    // Polyfill Node built-ins for browser bundles
    config.resolve.fallback = {
      fs: false,
      net: false,
      tls: false,
      crypto: require.resolve('crypto-browserify'),
      stream: require.resolve('stream-browserify'),
      buffer: require.resolve('buffer/'),
    };

    // Rewrite node: URI scheme → resolved paths so webpack can bundle them
    config.plugins.push(
      new webpack.NormalModuleReplacementPlugin(
        /^node:crypto$/,
        require.resolve('crypto-browserify'),
      ),
      new webpack.NormalModuleReplacementPlugin(
        /^node:buffer$/,
        require.resolve('buffer/'),
      ),
      new webpack.NormalModuleReplacementPlugin(
        /^node:stream$/,
        require.resolve('stream-browserify'),
      ),
      new webpack.NormalModuleReplacementPlugin(
        /^node:path$/,
        require.resolve('path-browserify'),
      ),
      new webpack.NormalModuleReplacementPlugin(
        /^node:os$/,
        require.resolve('os-browserify/browser'),
      ),
    );

    return config;
  },
};

module.exports = nextConfig;
