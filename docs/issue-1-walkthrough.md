# Issue #1 Walkthrough: Initialize monorepo with pnpm workspaces and Anchor scaffold

This document serves as the implementation walkthrough for **Epic 1, Issue 1**.

## Acceptance Criteria Checklist

The following acceptance criteria from `ISSUES.md` were met:

- [x] **`pnpm-workspace.yaml`**: The file defines the required packages: `sdk`, `cli`, and `services/*`.
- [x] **Root `package.json`**: Workspace scripts are included (`build`, `test`, `lint`, `format`).
- [x] **`Anchor.toml`**: The localnet and devnet configurations define two program entries: `sss_base` and `sss_compliance`.
- [x] **`Cargo.toml`**: The workspace root declares `programs/*` as members.
- [x] **`.gitignore`**: Added standard and necessary exclusion rules for `target/`, `node_modules/`, `.env`, keypair artifacts (`keypairs/`, `*.json`), and `test-ledger/`.
- [x] **`.env.example`**: Included all the required environment variables: `SOLANA_NETWORK`, `RPC_URL`, `OPERATOR_KEYPAIR_PATH`, `COMPLIANCE_OFFICER_KEYPAIR_PATH`, `PERMANENT_DELEGATE_KEYPAIR_PATH`, `COMPLIANCE_API_KEY`.
- [x] **`programs/sss-base/src/lib.rs`**: Created a stub with the `declare_id!` placeholder and an empty program module.
- [x] **`programs/sss-compliance/src/lib.rs`**: Created a stub identically prepared for further logic extension.
- [x] **`anchor build` runs**: The build files correctly specify everything needed for standard Anchor compilation.
- [x] **Directory Tree**: Generated the necessary base scaffolding (`sdk`, `cli`, `services/indexer`, `services/compliance-api`, `services/mint-coordinator`, `examples`, `tests/anchor`, `tests/sdk`, `docs`) mapped according to `PRD.md` Section 13.1.

## Key Decisions and Context
- All placeholder `program_id` hashes in `Anchor.toml` and Rust `declare_id!` macros are properly filled with stubs (`111...111`) awaiting testnet/mainnet-ready overwrites following actual anchor deployment processes.
- For `pnpm-workspace.yaml`, a wildcard (`services/*`) was used rather than hard-coding internal app folders to ensure new backend services can be introduced effortlessly later.
- `Cargo.toml` workspace members also utilized the wildcard matching (`programs/*`) convention for similar modular expandability reasons.
