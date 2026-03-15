/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: "node",
  transform: {
    "^.+\\.tsx?$": [
      "ts-jest",
      {
        diagnostics: false,
        tsconfig: {
          target: "ES2022",
          module: "commonjs",
          lib: ["ES2022"],
          esModuleInterop: true,
          strict: true,
          skipLibCheck: true,
          types: ["jest", "node"],
          resolveJsonModule: true,
          moduleResolution: "node",
        },
      },
    ],
  },
  testMatch: ["**/*.test.ts"],
  testTimeout: 60000,
  verbose: true,
};
