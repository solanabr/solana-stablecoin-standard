# Solana Stablecoin Standard (SSS)

A modular SDK for creating and managing stablecoins on Solana, with three preset configurations: SSS-1 (Basic), SSS-2 (Compliant), and SSS-3 (Private).

## Overview

SSS provides a standardized framework for stablecoin issuance on Solana, similar to OpenZeppelin's role-based access control for Ethereum. It leverages Token-2022 extensions and offers three progressively more sophisticated presets.

## Quick Start

```typescript
import { SolanaStablecoin, Presets } from "@stbr/sss-token";
import { Connection, Keypair } from "@solana/web3.js";

const connection = new Connection("https://api.devnet.solana.com");
const wallet = Keypair.fromSecretKey(/* ... */);

const stablecoin = await SolanaStablecoin.create({
  connection,
  payer: wallet,
  name: "My USD",
  symbol: "MUSD",
  decimals: 6,
  preset: "SSS_1",
});
```

## Preset Comparison

| Feature | SSS-1 | SSS-2 | SSS-3 |
|---------|-------|-------|-------|
| Mint/Burn | ✅ | ✅ | ✅ |
| Pause/Unpause | ✅ | ✅ | ✅ |
| Freeze/Thaw | ✅ | ✅ | ✅ |
| Role Management | ✅ | ✅ | ✅ |
| Blacklist | - | ✅ | - |
| Token Seizure | - | ✅ | - |
| Transfer Hook | - | ✅ | - |
| Privacy (Cloak) | - | - | ✅ |
| Viewing Keys | - | - | ✅ |

## Architecture

SSS follows a three-layer architecture:

```
Layer 3 — Standard Presets (SSS-1, SSS-2, SSS-3)
    ↑ opinionated combinations of ↑
Layer 2 — Modules (Compliance Module, Privacy Module)
    ↑ composable pieces on top of ↑
Layer 1 — Base SDK (Token-2022 creation, role management, CLI, TS SDK)
```

## Installation

```bash
npm install @stbr/sss-token
npm install -g sss-token
```

## Documentation

- [Architecture](docs/ARCHITECTURE.md)
- [SDK Reference](SDK.md)
- [SSS-1 Specification](SSS-1.md)
- [SSS-2 Specification](SSS-2.md)
- [SSS-3 Specification](SSS-3.md) - **The Differentiator**
- [Compliance](COMPLIANCE.md)
- [Operations](OPERATIONS.md)
- [API Reference](API.md)

## The Differentiator: SSS-3 Private Stablecoin

SSS-3 is powered by [Cloak Protocol](https://cloak.ag), a production-grade privacy protocol for Solana. Unlike public stablecoins that expose all transactions on-chain, SSS-3 offers:

- **Selective Transparency**: Private by default, auditable by authorized parties via viewing key hierarchy
- **Compliance at the Boundary**: Sanctions screening enforced at shield/unshield points without exposing private transfers
- **Non-custodial Guarantees**: Relay coordinates but cannot forge proofs or steal funds

This represents a fundamentally different approach to stablecoin compliance: instead of public blacklists and reactive seizure (SSS-2), SSS-3 offers proactive, privacy-preserving compliance that aligns with where regulation is heading (GENIUS Act, MiCA).

## CLI Usage

```bash
# Initialize stablecoin
sss-token init --preset sss-1 --name "MyUSD" --symbol "MUSD" --decimals 6

# Mint tokens
sss-token mint --recipient <address> --amount 1000

# Pause/Unpause
sss-token pause
sss-token unpause

# SSS-2 Blacklist
sss-token blacklist add --address <addr> --reason "OFAC match"
sss-token seize --address <addr> --to <treasury>

# SSS-3 Privacy
sss-token shield --amount 1000
sss-token private-send --recipient <addr> --amount 100
sss-token unshield --amount 500 --to <addr>
```

## Program IDs (Devnet)

- Stablecoin Program: `AmBgA4sV1xFrT4BwbqUU3P3cFqLa6yNJmHyX98k4eW1j`
- Transfer Hook Program: `FiUMBoLyzCzgXQwysxY7ypo4DcZ21Svd2qScsfdtsrj`

## License

MIT
