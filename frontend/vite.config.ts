import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { nodePolyfills } from 'vite-plugin-node-polyfills'

export default defineConfig({
  plugins: [
    react(),
    nodePolyfills({
      include: ['buffer', 'crypto', 'stream', 'util', 'process'],
      globals: { Buffer: true, process: true },
    }),
  ],
  resolve: {
    preserveSymlinks: true,
    alias: {
      '@': '/src',
    },
  },
  optimizeDeps: {
    include: ['solana-stablecoin-sdk'],
  },
  build: {
    commonjsOptions: {
      include: [/node_modules/, /sdk\/dist/],
    },
    rollupOptions: {
      onwarn(warning, warn) {
        // Suppress circular dependency warnings from node polyfills
        if (warning.code === 'CIRCULAR_DEPENDENCY') return;
        warn(warning);
      },
    },
  },
  define: {
    'process.env': {},
  },
})
