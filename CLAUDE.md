# Claude Agent Instructions — Solana Stablecoin Standard

## Project Overview

This is the **Solana Stablecoin Standard (SSS)** — an open-source SDK and on-chain program suite for issuing compliant stablecoins on Solana, built on Token-2022.

## Repository Structure

```
programs/
  sss-token/       — Core Anchor program (SSS-1 + SSS-2 via config flags)
  transfer-hook/   — SSS-2 transfer hook program (blacklist enforcement)
sdk/core/          — @stbr/sss-token TypeScript SDK + CLI
tests/             — Anchor integration tests (ts-mocha + LiteSVM)
backend/           — Docker services: mint-service, indexer, compliance-service
scripts/           — Devnet deployment and smoke-test scripts
trident-tests/     — Fuzz tests (Trident)
docs/              — Standard specifications and operator guides
```

## Standards

- **SSS-1** — Minimal stablecoin: mint authority + freeze authority + metadata. For DAO treasuries, ecosystem tokens.
- **SSS-2** — Compliant stablecoin: SSS-1 + permanent delegate + transfer hook + blacklist enforcement. GENIUS Act compatible.

## Development Commands

```bash
# Build programs
anchor build

# Sync program IDs (run after first build)
anchor keys sync

# Run tests
anchor test

# Run SDK tests only
yarn workspace @stbr/sss-token test

# Deploy to devnet
anchor deploy --provider.cluster devnet

# Run scripts
ts-node scripts/devnet/initialize-sss1.ts
ts-node scripts/devnet/initialize-sss2.ts
```

## Critical Rules

1. **Never commit keypairs** — .gitignore blocks *.json except package.json and tsconfig.json
2. **Token-2022 only** — Use `anchor_spl::token_interface` (InterfaceAccount, Interface<TokenInterface>), never `token` or `token_2022` directly
3. **Store bumps** — Always store canonical bump on account at init time; use `bump = account.bump` in subsequent constraints
4. **Two-step authority** — All authority transfers use nominate → accept pattern
5. **SSS-2 graceful failure** — SSS-2 instructions MUST return `StablecoinError::Sss2NotEnabled` if `enable_transfer_hook` or `enable_permanent_delegate` is false
6. **No raw AccountInfo** — Always use typed Anchor account wrappers
7. **Vault-favoring rounding** — Math always rounds against the user
8. **Test both paths** — Test SSS-1 and SSS-2 independently; test all error cases

## Workflow

1. After any program change: `anchor build && anchor keys sync`
2. Before committing: `cargo clippy --all -- -D warnings` + `cargo fmt --all`
3. All tests must pass: `anchor test`

## Pre-Deployment Checklist

- [ ] `anchor keys sync` run after final build
- [ ] All tests passing
- [ ] Devnet deployment proof in docs/
- [ ] Program IDs updated in Anchor.toml and lib.rs
- [ ] docker-compose.yml tested with `docker compose up`
