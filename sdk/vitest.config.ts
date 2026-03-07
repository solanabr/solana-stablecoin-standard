import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
  },
  resolve: {
    alias: {
      "@stbr/sss-token": path.resolve(__dirname, "./src/index.ts"),
    },
  },
});
