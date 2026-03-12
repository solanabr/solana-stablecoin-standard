/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: "node",
  transform: {
    "^.+\\.tsx?$": [
      "ts-jest",
      {
        tsconfig: {
          target: "ES2022",
          module: "commonjs",
          lib: ["ES2022"],
          esModuleInterop: true,
          strict: true,
          skipLibCheck: true,
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
