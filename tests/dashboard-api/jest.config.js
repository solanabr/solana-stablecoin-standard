/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  roots: ["<rootDir>"],
  testMatch: ["**/*.test.ts"],
  transform: {
    "^.+\\.ts$": [
      "ts-jest",
      {
        tsconfig: "./tsconfig.json",
      },
    ],
  },
  moduleFileExtensions: ["ts", "js", "json"],
  testTimeout: 15000,
  // Suppress noisy console output from the middleware/error handler during tests
  silent: true,
};
