# Solana Stablecoin Standard - Full SDK + SSS-1 + SSS-2 + SSS-3

## Overview

Modular stablecoin SDK for Solana with three standard presets, following an OpenZeppelin-style pattern: the library is the SDK, and the standards (SSS-1, SSS-2, SSS-3) are opinionated presets built on top.

## What's Included

### On-Chain Programs (Anchor + Token-2022)

**`sss-stablecoin`** - 13 instructions with real Token-2022 extension support:

- `initialize` creates Token-2022 mints with configurable extensions (Permanent Delegate, Transfer Hook, Default Account State) via raw CPI - extensions are initialized before `InitializeMint2`
- `mint` / `burn` - role-gated with per-minter quotas
- `freeze_account` / `thaw_account` - via Token-2022 freeze authority
- `pause` / `unpause` - emergency stop for operations
- `update_minter` / `update_roles` - granular RBAC (minter, burner, pauser, blacklister, seizer)
- `propose_authority` / `accept_authority` - two-step authority transfer
- `add_to_blacklist` / `remove_from_blacklist` - creates/closes `BlacklistEntry` PDAs
- `seize` - transfers tokens from frozen accounts via permanent delegate

**`sss-transfer-hook`** - SPL Transfer Hook interface implementation:

- `initialize_extra_account_meta_list` - creates `ExtraAccountMetaList` PDA for account resolution
- `transfer_hook` - checks sender/receiver blacklist status on every transfer
- `fallback` - dispatches `TransferHookInstruction` discriminators from Token-2022 CPI

### Verified Demo Flows (Surfpool Localnet)

**SSS-1 (8/8 steps):** init -> add minter -> mint 100K -> check supply -> freeze -> thaw -> pause -> unpause

**SSS-2 (8/8 steps):** init with extensions -> init `ExtraAccountMetaList` -> mint 500K -> transfer OK -> blacklist (OFAC) -> **transfer blocked by hook** -> freeze -> **seize via permanent delegate** -> recipient balance = 0

**SSS-3:** init with privacy flag -> connect to live Cloak relay -> Merkle root verified -> viewing key endpoint reachable -> SDK/relay endpoint mapping confirmed

### TypeScript SDK (`@stbr/sss-token`)

- `SolanaStablecoin.create()` with preset support (`SSS_1`, `SSS_2`, `SSS_3`)
- Full instruction wrappers, compliance module, and privacy module with Cloak relay client

### Admin CLI (`sss-token`)

- Stablecoin operations: init, mint, burn, freeze, thaw, pause, blacklist, seize
- SSS-3 operations: shield, private-send, unshield, viewing-key

### Backend Services

- Event indexer, compliance service, webhook service
- `docker compose up` supported with health checks

### Tests

- Rust unit tests for stablecoin + transfer-hook programs
- TypeScript smoke tests

### Documentation

Includes architecture, SDK, operations, compliance, and SSS-1/2/3 docs following project documentation patterns.

## The Differentiator: SSS-3 Private Stablecoin

SSS-3 is powered by **[Cloak Protocol](https://cloak.ag)** - a privacy protocol for Solana.

SSS-2 solves compliance through restriction (public blacklists, freeze, seize). SSS-3 adds **selective transparency**:

- Shielded UTXO pool with ZK proofs
- Viewing key hierarchy: Issuer Master Key -> Compliance Officer (scoped) -> Auditor (read-only, time-bounded)
- Compliance at the boundary: sanctions screening at shield/unshield
- Non-custodial relay model

In the demo, SSS programs and Cloak's shield pool + relay run on the same Surfpool localnet. The SSS-3 module connects to a real, live relay.

## Architecture

```text
Layer 3 - Presets: SSS-1 (Minimal) | SSS-2 (Compliant) | SSS-3 (Private/Cloak)
    ^
Layer 2 - Modules: Compliance (transfer hook + blacklist + seize) | Privacy (Cloak)
    ^
Layer 1 - Base SDK: Token-2022 + Role Management + CLI + TS SDK
```

## How To Run

```bash
# Prerequisites: Rust, Anchor 0.30.1, Node.js, Surfpool

# Build
cargo build-sbf

# Test
cargo test

# Deploy to Surfpool localnet
surfpool start
solana program deploy target/deploy/sss_stablecoin.so
solana program deploy target/deploy/sss_transfer_hook.so

# Run full demo
./scripts/demo-all.sh

# Backend services
docker compose up
```

## Author

**Marcelo** - Founder of [Cloak Protocol](https://cloak.ag), student at Inteli (Instituto de Tecnologia e Lideranca).
