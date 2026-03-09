import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { nodePolyfills } from "vite-plugin-node-polyfills";
import path from "path";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    nodePolyfills({
      // Polyfill Buffer, process, crypto, etc. needed by Solana libs
      globals: {
        Buffer: true,
        global: true,
        process: true,
      },
      protocolImports: true,
    }),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@sss/sdk": path.resolve(__dirname, "../sdk/src/index.ts"),
    },
  },
  define: {
    // Ensure global is defined for packages that expect it
    "global": "globalThis",
  },
  optimizeDeps: {
    include: [
      "@coral-xyz/anchor",
      "@solana/web3.js",
      "@solana/wallet-adapter-react",
      "@solana/wallet-adapter-react-ui",
      "@solana/wallet-adapter-wallets",
      "bn.js",
    ],
    esbuildOptions: {
      target: "esnext",
    },
  },
  build: {
    target: "esnext",
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        manualChunks: {
          "solana-web3": ["@solana/web3.js"],
          anchor: ["@coral-xyz/anchor"],
          "wallet-adapter": [
            "@solana/wallet-adapter-base",
            "@solana/wallet-adapter-react",
            "@solana/wallet-adapter-react-ui",
          ],
          wallets: ["@solana/wallet-adapter-wallets"],
          react: ["react", "react-dom", "react-router-dom"],
        },
      },
    },
  },
});
