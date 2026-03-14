# Solana Stablecoin Standard (SSS)

Open-source reference implementation of the **Solana Stablecoin Standard** with two presets:

- **SSS-1**: issuer-grade stablecoin with mint/burn/freeze/pause and RBAC.
- **SSS-2**: adds compliance controls (blacklist, seize via Permanent Delegate, transfer-hook enforcement).

## Overview

This repository is the hackathon/grant submission for an open stablecoin standard on Solana. The main deliverable is the SDK and standard presets:

- a configurable Token-2022 stablecoin toolkit,
- a reference Anchor implementation for issuer and compliance controls,
- an admin CLI,
- backend services for mint/burn, indexing, compliance, and webhooks,
- an example frontend for creation and operations.

The intended developer experience is:

1. choose a preset or custom config,
2. create a stablecoin with the SDK or CLI,
3. operate it through RBAC-safe admin flows,
4. monitor events and compliance state through backend services and UI.

## Repository Layout

```text
SSS/
├── programs/
│   ├── sss-stablecoin/      # Anchor program for SSS-1 + SSS-2
│   └── sss-transfer-hook/   # Anchor transfer hook enforcement program
├── sdk/
│   ├── core/                # @stbr/sss-token TypeScript SDK
│   └── cli/                 # sss-token admin CLI
├── backend/
│   ├── mint-burn/           # REST execution service
│   ├── indexer/             # event indexer + webhook dispatcher
│   ├── compliance/          # compliance API service
│   └── docker-compose.yml
├── tests/                   # Anchor TS integration tests
├── trident-tests/           # Trident scaffold/docs (fuzz harness setup pending)
├── docs/                    # architecture/spec/runbook/API docs
├── sss.lock.example.json    # example operator/backend lockfile
└── .github/workflows/ci.yml
```

## Preset Comparison

| Capability                     | SSS-1 | SSS-2 |
| ------------------------------ | ----: | ----: |
| Mint/Burn/Freeze/Thaw/Pause    |   Yes |   Yes |
| Role-based authorities         |   Yes |   Yes |
| Per-minter time-window quotas  |   Yes |   Yes |
| Transfer Hook blacklist checks |    No |   Yes |
| Compliance records PDA lookup  |    No |   Yes |
| Seize via Permanent Delegate   |    No |   Yes |

## Architecture

```mermaid
flowchart TD
  Admin[Admin/Issuer] --> CLI[sss-token CLI]
  Admin --> SDK[@stbr/sss-token SDK]
  Admin --> Frontend[Issuer Frontend]
  CLI --> Stablecoin[sss-stablecoin program]
  SDK --> Stablecoin
  Frontend --> SDK
  Token2022[Token-2022 Program] --> Hook[sss-transfer-hook program]
  Hook --> Stablecoin
  Backend[backend services] --> SDK
  Backend --> Postgres[(Postgres)]
  Backend --> Webhooks[Webhook targets]
```

## Current Status

- Local Anchor integration suite passes: `21/21`
- Backend packages build and smoke-test cleanly
- `backend/docker-compose.yml` parses successfully
- Trident fuzz harness is present and compiles
- Programs deployed on devnet:
  - `sss-stablecoin`: `5C7LHvieTag3oioHsni4SgTVDeCYMLTchix5obimXkEL`
  - `sss-transfer-hook`: `CHfiQPpbATb9qDbYMA8sRKPxRu3sYHdMW4s4JG4xJt1H`
- Devnet SSS-2 smoke flow completed successfully; see `docs/DEPLOYMENT.md`

Known limitation:

- Token metadata is stored on-chain in the SSS config PDA. The SDK create flow initializes the mint with a metadata pointer to the config PDA and writes `name`, `symbol`, and `uri` into the config during `initialize_existing_mint`.

## Local Development (macOS)

### Required tools

- Rust toolchain (`rustup`, `cargo`, `rustc`)
- Solana CLI
- Anchor CLI (`anchor-cli` v0.32.1)
- Node.js 22+
- pnpm 10+
- Docker Desktop

### Install commands (Apple Silicon/macOS)

```bash
# Homebrew (if missing)
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# Node + pnpm
brew install node
npm install -g pnpm@10

# Rust
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
source "$HOME/.cargo/env"

# Solana CLI (Anza)
sh -c "$(curl -sSfL https://release.anza.xyz/stable/install)"
export PATH="$HOME/.local/share/solana/install/active_release/bin:$PATH"
solana-install init 3.0.6

# Anchor CLI
cargo install --git https://github.com/coral-xyz/anchor --tag v0.32.1 anchor-cli --force

# Docker Desktop
brew install --cask docker
```

### Bootstrap

```bash
pnpm install
anchor build
```

### Quick start

```bash
# 1. install dependencies
pnpm install

# 2. build programs and packages
anchor build
pnpm build

# 3. run local validator tests
RUN_ANCHOR_TESTS=1 anchor test --skip-build

# 4. run frontend demo
pnpm frontend:dev
```

### Run checks

```bash
cargo fmt --check
cargo clippy -p sss-stablecoin -p sss-transfer-hook --all-targets -- -D warnings
RUN_ANCHOR_TESTS=1 anchor test --skip-build
pnpm -r lint
pnpm -r test
cd backend && docker compose build
cargo test --manifest-path trident-tests/Cargo.toml
```

## CLI quick start

```bash
# SSS-1
pnpm --filter @stbr/sss-token-cli build
sss-token init --preset sss-1 --name "USD1" --symbol USD1 --treasury <TREASURY_TOKEN_ACCOUNT>

# SSS-2
sss-token init --preset sss-2 --name "USD2" --symbol USD2 --treasury <TREASURY_TOKEN_ACCOUNT>
```

See `docs/` for full details.

## Frontend

The example issuer dashboard lives in `frontend/`.

It supports:

- wallet connect,
- stablecoin creation with `SSS-1`, `SSS-2`, or custom config,
- lockfile import/export,
- mint, burn, freeze, thaw, pause, unpause,
- blacklist and seize for `SSS-2`,
- minter management,
- holders and audit activity views.

Run it with:

```bash
pnpm frontend:dev
```

## Interactive TUI

The CLI also includes an interactive terminal UI for monitoring and operations:

```bash
pnpm --filter @stbr/sss-token-cli build
node sdk/cli/dist/index.cjs tui --rpc https://api.devnet.solana.com
```

## Submission Notes

- Real devnet program IDs, signatures, and smoke-test addresses are documented in `docs/DEPLOYMENT.md`.
- Submission readiness, verified surfaces, and known gaps are tracked in `docs/SUBMISSION.md`.
- To run backend services locally, copy `sss.lock.example.json` to `sss.lock.json` and update it for your mint.
