# Solana Stablecoin Standard (SSS)

Open-source SDK and on-chain standards for building stablecoins on Solana. Built by [Superteam Brazil](https://superteam.fun).

## Overview

The Solana Stablecoin Standard provides a modular, production-ready toolkit for issuing stablecoins on Solana using Token-2022 extensions. Think OpenZeppelin for Solana stablecoins: the SDK is the library, the standards (SSS-1, SSS-2) are the opinionated presets.

```
Layer 3 — Standards:    SSS-1 (Minimal)     SSS-2 (Compliant)
                            ↑                     ↑
Layer 2 — Modules:      Compliance Module (Transfer Hook + Blacklist)
                            ↑
Layer 1 — Base SDK:     Token-2022 mint + metadata + role management
```

## Standards

| Standard | Name | Description |
|----------|------|-------------|
| **SSS-1** | Minimal Stablecoin | Mint authority + freeze authority + on-chain metadata. What every stablecoin needs — nothing more. |
| **SSS-2** | Compliant Stablecoin | SSS-1 + permanent delegate + transfer hook + blacklist enforcement. For regulated stablecoins (USDC/USDT class). |

## Quick Start

### Install

```bash
# Clone the repo
git clone https://github.com/solanabr/solana-stablecoin-standard
cd solana-stablecoin-standard

# Install dependencies
pnpm install

# Build programs
anchor build
```

### Deploy to localnet

```bash
solana-test-validator --reset
anchor deploy
```

### Initialize a stablecoin

```bash
# SSS-1 (minimal)
sss-token init --preset sss-1 --name "My Stablecoin" --symbol MYUSD --decimals 6

# SSS-2 (compliant — for regulated issuers)
sss-token init --preset sss-2 --name "Compliant USD" --symbol CUSD --decimals 6
```

### TypeScript SDK

```typescript
import { SolanaStablecoin, Presets } from "@stbr/sss-token";

// Create SSS-2 stablecoin
const stable = await SolanaStablecoin.create(connection, {
  preset: Presets.SSS_2,
  name: "My Stablecoin",
  symbol: "MYUSD",
  decimals: 6,
  authority: adminKeypair,
});

// Mint tokens
await stable.mint({ recipient: userPubkey, amount: 1_000_000n }, minterKeypair);

// SSS-2 compliance operations
await stable.compliance.blacklistAdd(suspiciousAddress, "OFAC match");
await stable.compliance.seize(frozenAccount, treasury);
```

## Repository Structure

```
programs/
  sss-token/          On-chain program: core instructions + SSS-2 compliance
  sss-transfer-hook/  Token-2022 hook: blacklist enforcement on transfers

sdk/core/             @stbr/sss-token TypeScript SDK
cli/sss-token/        Admin CLI

services/
  indexer/            Event listener → webhook dispatcher
  mint-burn/          REST API for mint/burn lifecycle
  compliance/         SSS-2 blacklist management + audit trail

tests/                Integration + unit tests (Mocha)
trident-tests/        Fuzz tests
docs/                 Architecture, standard specs, operator runbooks
```

## Programs

Both programs are deployed on **devnet**:

| Program | ID | Description |
|---------|----|-------------|
| `sss-token` | [`AeCfxEUv75EWAGgjnhAZhViFbkfsP1imLsg4xb3xuntm`](https://explorer.solana.com/address/AeCfxEUv75EWAGgjnhAZhViFbkfsP1imLsg4xb3xuntm?cluster=devnet) | Main stablecoin program |
| `sss-transfer-hook` | [`9bFjVjyZ3vVmNBFaVVKmjVrzcwwzRNuwWqYpqeM2pzF7`](https://explorer.solana.com/address/9bFjVjyZ3vVmNBFaVVKmjVrzcwwzRNuwWqYpqeM2pzF7?cluster=devnet) | Transfer hook (SSS-2) |

## Devnet Proof

Live transactions on devnet demonstrating both preset lifecycles:

### SSS-1 — Minimal Stablecoin (`cLe1yquGhCZcmc7xevcU72bfX2rtn8sABVddZzX6iDH`)

| Operation | Transaction |
|-----------|-------------|
| `initialize` | [`QZY9TbQ...`](https://explorer.solana.com/tx/QZY9TbQy7uyUCKDjcSpXLuvcFayKMWeHptnExetZqcWhXqug7MgAgC6h9hH3ZSsWpJSeqLSxRjQU8wFo8eMgBsU?cluster=devnet) |
| `mint_tokens` | [`4NK2xnj...`](https://explorer.solana.com/tx/4NK2xnjpkqy4fPAToo5TaiFBRSzH8Q89hnhGcj9DkqkPtC3ZjcK2sBUMidGr94R7mZoGGyqhtHCfez4YB7vu1Kex?cluster=devnet) |
| `pause` | [`Z47X9dB...`](https://explorer.solana.com/tx/Z47X9dBBP9iBEGz7bjxDf15yHUnvCzzE6i3aEpW2ZagLqeqAmMRqGtshRutHxvKfund4hjGfcKirFWziVX6KScr?cluster=devnet) |
| `unpause` | [`2yGX8EB...`](https://explorer.solana.com/tx/2yGX8EBJmNpYiRtuunVCMzSzivnpK4ZLoYct36LcVdn8Pz2tMpUqYbgZDSVBW38grQ7gMRp6ceUhDSSd1U8fbbQw?cluster=devnet) |

### SSS-2 — Compliant Stablecoin (`AHvt6c2cEeitUyRTAERUxtGL4HS6z89wSKTjUP1KjEDa`)

| Operation | Transaction |
|-----------|-------------|
| `initialize` | [`4oYKXwr...`](https://explorer.solana.com/tx/4oYKXwrX9EkQSdbZi75zduR1Da8mN9iWp8pba5yG8QdxjQeboJQV5RkQoMNXk6KiNmtxGMvcGFoRDPTqhLYFF56a?cluster=devnet) |
| `init_extra_account_meta_list` | [`2n5FEkL...`](https://explorer.solana.com/tx/2n5FEkLUKfzmS3qZiaUWMgV1AKGcdXbPksKoNyjg2J2sgZUBEv1j6BtbGSYc1F6AmcW2WHqPYnh8fm9mpuhhCdn9?cluster=devnet) |
| `mint_tokens` | [`5ZLCefJ...`](https://explorer.solana.com/tx/5ZLCefJfqh54Tyb6xZsB5ZVRT3GhMovAoCBHeUQpr2uUrw3VSrkVgwUvwmP5ZuJmirRysrikR5AWH3ft96nduLCY?cluster=devnet) |
| `add_to_blacklist` | [`SEJu4UE...`](https://explorer.solana.com/tx/SEJu4UED7Db19hrMztMHeGXT3eZQoENPGiZZA5JYN2oarPkRcD4majSrD9QaBLFML9ZN2nceKMEaXfn54YHvJdD?cluster=devnet) |
| `seize` | [`52UBEnW...`](https://explorer.solana.com/tx/52UBEnWPU8zvQk5yxRAiMtm62J3NFmBNYvTUqUAiUwWQTi8HXZaUskfcaDZJT6VSzQ87jGjZoWpzyWGnVxS3fWj2?cluster=devnet) |
| `remove_from_blacklist` | [`3353EFe...`](https://explorer.solana.com/tx/3353EFe1poVnrKDbCAXUFPDqCMEGLyEivim1Ff39xkchVkMY6JaGzGhoiMwyoqzJkjzwkFRD3tDmT1QwE21kFHr8?cluster=devnet) |

## Documentation

- [Architecture](docs/ARCHITECTURE.md) — Layer model, data flows, security model
- [SSS-1 Standard](docs/SSS-1.md) — Minimal stablecoin spec
- [SSS-2 Standard](docs/SSS-2.md) — Compliant stablecoin spec
- [SDK Reference](docs/SDK.md) — TypeScript SDK usage
- [Operations Runbook](docs/OPERATIONS.md) — Operator guide
- [Compliance Guide](docs/COMPLIANCE.md) — Regulatory considerations
- [API Reference](docs/API.md) — Backend services API

## Running Tests

```bash
# All tests
anchor test

# TypeScript integration tests only
pnpm ts-mocha -p ./tsconfig.json -t 1000000 tests/**/*.ts
```

## Backend Services

```bash
# Set required environment variables
export MINT=<your-mint-pubkey>
export RPC_URL=http://localhost:8899

# Start all services
docker compose up

# Services:
#   http://localhost:3000  — Indexer (event listener + webhooks)
#   http://localhost:3001  — Mint/burn REST API
#   http://localhost:3002  — Compliance API (SSS-2)
```

## License

MIT — Copyright 2026 Superteam Brazil
