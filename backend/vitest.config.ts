import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    testTimeout: 10_000,
    // Each test file gets its own isolated environment so database
    // singletons don't leak between suites.
    fileParallelism: false,
  },
});
