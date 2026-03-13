# Solana Stablecoin Standard

The Solana Stablecoin Standard (SSS) is a modular open-source SDK and reference implementation for issuing stablecoins on Solana with Token-2022. It is structured as a layered system: a base issuance SDK, optional compliance/privacy modules, and opinionated presets that institutions can adopt directly.

This repository is organized around three standards. `SSS-1` is the minimal baseline for internal treasury and settlement use cases. `SSS-2` adds compliance controls for regulated issuers, including blacklist enforcement and seizure-oriented authority flows. `SSS-3` adds confidential-transfer-ready mint configuration, an in-repo ZK compliance verifier, proof receipts, and compressed compliance-state roots for privacy-preserving regulated flows.

## Why Reviewers Usually Stop Here First

This repo is intentionally broader than a token demo. It combines:

- Token-2022 extension orchestration for stablecoin issuance
- Anchor programs for stablecoin state, transfer-hook enforcement, and on-chain registry records
- a TypeScript SDK for transaction builders and on-chain creation flows
- a CLI for issuer-grade operations, role delegation, registry publishing, and devnet execution
- an SSS-3 proof system with proof receipts and compressed compliance roots
- Dockerized backend services for mint requests, compliance, events, and webhooks
- a wallet-enabled frontend control plane and documentation hub

The result is a protocol surface that feels closer to "stablecoin infrastructure stack" than "single SDK package."

## Quick Start

```bash
npm install
npm run build
npm run build:programs
npm run frontend:deploy
npm run verify
npm run smoke:localnet:e2e
docker compose up --build
sss-token init --preset sss-1 --rpc https://api.devnet.solana.com --keypair ~/.config/solana/id.json
sss-token mint <recipient> <amount>
sss-token status
```

The current repository includes a deterministic local verification pass via `npm run verify`. It validates the built SDK modules, CLI argument/config helpers, and backend shared primitives without requiring a local validator.
`npm run build:programs` is the deployment-critical build path for the on-chain binaries in `target/deploy/`.
`npm run frontend:serve` hosts the frontend at `http://127.0.0.1:4173` for local wallet testing.
`npm run frontend:deploy` exports a static frontend bundle into `artifacts/frontend-static/` for HTTP/HTTPS deployment.
If a local validator is running on `127.0.0.1:8899`, `npm run smoke:localnet` performs an RPC reachability check and runs the SSS-1/SSS-2 transaction-building smoke harness.
`npm run smoke:localnet:e2e` is the high-coverage local validator harness for the registry + SSS-1/SSS-2/SSS-3 flow, including the in-repo zk proof submission path.
For real devnet creation, `sss-token init` now submits the initialize transaction when `--dry-run` is omitted and a funded `--keypair` is provided.
`sss-token registry` emits a registry-ready payload with a deterministic config hash.
The repo now also includes a dedicated on-chain `sss-registry` program for release/version publishing and stablecoin registration, and registry writes are validated against the referenced stablecoin config account before they are accepted.
`sss-token registry-register --dry-run` and `sss-token registry-release --dry-run` build the corresponding on-chain registry instructions from the CLI.
CLI configs now support composable inheritance across presets and local TOML/JSON files, so issuer base configs can be layered under environment-specific overrides.
Backend services are Dockerized and can be started from the repository root with `docker compose up --build`. Every non-health endpoint now requires `SERVICE_API_KEY`.

Important frontend note: browser extension wallets generally do not inject into `file://` pages. Open the frontend through `npm run frontend:serve` or deploy `artifacts/frontend-static/` behind HTTP/HTTPS when testing Phantom, Solflare, or Backpack.

## Why This Repo Matters

This is not just a Token-2022 wrapper. The repository is designed to solve the three hard problems that make stablecoin infrastructure adoptable:

- enforcement: SSS-2 does not merely store compliance state, it enforces blacklist checks on every transfer through a dedicated transfer-hook program and supports seizure-oriented operational flows with role separation
- discoverability: the `sss-registry` program validates the referenced stablecoin config PDA before registration, so wallets, DeFi protocols, and auditors can verify whether a mint is actually an SSS deployment, which preset it uses, and whether it is running a deprecated standard version
- operator usability: the CLI and SDK route token-level mint, freeze, blacklist, pause, and seizure actions through the stablecoin config PDA, so issuers can delegate operations without handing raw token authorities to operators

The result is a repo that can be evaluated both as an SDK and as a protocol standard: easy to fork, easy to audit, and structured for integration by third parties.

## Presets

| Feature | SSS-1 | SSS-2 | SSS-3 |
|---|---|---|---|
| Mint/Burn | Yes | Yes | Yes |
| Freeze/Thaw | Yes | Yes | Yes |
| Pause | Yes | Yes | Yes |
| Permanent Delegate | No | Yes | Yes |
| Transfer Hook | No | Yes | Yes |
| Blacklist | No | Yes | Yes |
| Token Seizure | No | Yes | Yes |
| Default Account Frozen | No | Yes | Yes |
| Confidential Transfers | No | No | Yes |
| ZK Compliance Proofs | No | No | Yes |
| Compressed Compliance State | No | No | Yes |

## Architecture

```text
Layer 3: Standard Presets
  |- SSS-1 Minimal Stablecoin
  |- SSS-2 Compliant Stablecoin
  |- SSS-3 Confidential Compliant Stablecoin

Layer 2: Optional Modules
  |- Compliance
  |- Registry
  |- Confidential Compliance
  |- Privacy (planned)
  |- Oracle (planned)

Layer 1: Base SDK
  |- Anchor Programs
  |- TypeScript SDK
  |- Admin CLI
  |- Backend Services
```

## Differentiators

- Enforced compliance, not passive metadata: SSS-2 blacklist entries are consumed by the transfer-hook program, so blocked addresses fail at transfer time rather than relying on off-chain policy alone.
- Registry-backed trust surface: the on-chain registry acts like a standards directory and release ledger for stablecoins, which makes integrations safer for wallets and protocols.
- Config-as-code issuer workflows: preset inheritance gives operators a path from one-off demos to repeatable issuance pipelines.
- Bonus privacy track with real cryptography: SSS-3 includes an in-repo prover and on-chain verifier path instead of a placeholder flag-only design.

## Cool Tech In This Repo

- `Token-2022`: transfer hooks, permanent delegate support, default frozen accounts, and confidential-transfer-ready flows.
- `Anchor + PDAs`: stablecoin config, role assignments, blacklist entries, proof receipts, release records, and stablecoin registrations.
- `Transfer-hook enforcement`: compliance is checked at transfer time rather than being left as off-chain policy.
- `On-chain registry`: the `sss-registry` program publishes release metadata and stablecoin registrations with config-hash validation.
- `Zero-knowledge compliance`: SSS-3 ships an in-repo Merkle-Schnorr proof path with on-chain proof receipts and compressed compliance roots.
- `TypeScript SDK + CLI`: same protocol surface available to integrators and operators.
- `Dockerized services`: mint requests, event indexing, compliance, and webhook delivery behind a shared auth model.
- `Static frontend export`: deployable frontend artifact in `artifacts/frontend-static` plus a local HTTP preview server for wallet testing.

## Documentation

- [Architecture](./docs/ARCHITECTURE.md)
- [SDK](./docs/SDK.md)
- [Operations](./docs/OPERATIONS.md)
- [SSS-1](./docs/SSS-1.md)
- [SSS-2](./docs/SSS-2.md)
- [SSS-3](./docs/SSS-3.md)
- [Compliance](./docs/COMPLIANCE.md)
- [Registry](./docs/REGISTRY.md)
- [Registry Program](./docs/REGISTRY-PROGRAM.md)
- [API](./docs/API.md)
- [Devnet Launch](./docs/DEVNET-LAUNCH.md)
- [Deployment](./DEPLOYMENT.md)
- [Frontend Spec](./frontend.md)
- [Submission Guide](./SUBMISSION.md)
