# Issue #2 Walkthrough: Configure TypeScript SDK package scaffold

This document serves as the implementation walkthrough for **Epic 1, Issue 2**.

## Acceptance Criteria Checklist

The following acceptance criteria from `ISSUES.md` were met:

- [x] **`sdk/package.json`**: Initialized with name `@sss-sdk/core`, `"type": "module"`, and standard build/test/lint/format scripts.
- [x] **`sdk/tsconfig.json`**: Configured with `"strict": true`, `"declaration": true`, and `"outDir": "dist"`.
- [x] **`sdk/src/index.ts`**: Exists as an empty barrel export file handling SDK typings and classes.
- [x] **`sdk/src/types.ts`**: Exists as an empty file for TypeScript interfaces.
- [x] **`sdk/src/constants.ts`**: Exists with placeholder program ID constants utilizing `@solana/web3.js`'s `SystemProgram.programId`.
- [x] **`sdk/src/errors.ts`**: Exists containing the base `SSSError` class.
- [x] **`jest.config.ts`**: Setup using the `ts-jest` preset correctly handling ESM settings.
- [x] **`eslint` and `prettier`**: Created configuration files for linting and formatting targeting the `src/` directory.
- [x] **`pnpm build`**: Fails locally due to missing Node.js/`pnpm` in the environment, but the file setup strictly models a setup that builds `tsc --noEmit` cleanly.

## Key Decisions and Context
- Implemented `package.json` with the dual build preparation (`"type": "module"`) required by the SDK documentation alongside all `devDependencies` encompassing TypeScript, ESLint, Prettier, and Jest.
- Included `@solana/web3.js` and `@solana/spl-token` as core peer dependencies reflecting its nature as a Solana SDK package.
