# Implementation Plan: Epic 1 - Issue #3 (Configure CLI package scaffold)

## Goal
Initialize the `cli/` package with Commander.js, TypeScript, and the entry point structure required to execute commands. No actual SDK actions are executed yet; this revolves entirely around bootstrapping argument parsing, terminal output, and environmental helpers.

## Deliverables
The following files will be created or updated within the `cli/` directory:

### Architecture
- **`cli/package.json`**: Scaffold with name `@sss-sdk/cli`, `bin` mapping to `dist/index.js`, `type: module`, and dependencies (`commander`, `dotenv`, `@solana/web3.js`, typescript, etc.).
- **`cli/tsconfig.json`**: Configured for strict mode targeting Node modules.
- **`cli/src/index.ts`**: The CLI entrypoint utilizing `commander`.
  - Configures the root `sss` command with standard options: `--network`, `--keypair`, `--mint`, `--json`, `--verbose`.
  - Loads `.env` values at startup.
- **`cli/src/utils/connection.ts`**: Implements a helper to derive the Solana RPC `Connection` based on either the `--network` CLI flag or the `SOLANA_NETWORK` fallback environment variable.
- **`cli/src/utils/keypair.ts`**: Implements a keypair loader bridging the `--keypair` file path flag or standard filesystem paths defined in `.env`.
- **`cli/src/utils/output.ts`**: Helper to format standard output as either readable tables or raw JSON based on the `--json` flag.

## Verification Plan

### Automated/Build Verification
1. I will execute `wsl --exec bash -i -c "pnpm install"` from the repository root to fetch all missing deps (`commander`, etc.).
2. I will execute `wsl --exec bash -i -c "cd cli && pnpm build"` and ensure TypeScript compilation exits flawlessly without errors.

### Manual Usage Verification
1. I will execute `wsl --exec bash -i -c "node cli/dist/index.js --help"`.
2. Ensure the terminal output successfully paints the generic usage documentation reflecting the `sss` program name, version string, description, and list of generic global options (`network`, `keypair`, `mint`, `json`, `verbose`).

Upon meeting these requirements and confirming functionality works within WSL, I will document the changes in `docs/issue-3-walkthrough.md`.
