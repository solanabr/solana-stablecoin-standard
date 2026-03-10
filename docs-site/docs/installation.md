---
title: Installation
sidebar_position: 3
description: Package installation, dependency alignment, and environment expectations for the SSS SDK.
---

# Installation

## SDK Package

Install the published SDK:

```bash
npm install solana-stablecoin-standard@0.2.1
```

If your app already manages Solana dependencies directly, keep these versions aligned with the SDK examples and source:

```bash
npm install @coral-xyz/anchor@^0.31.1 @solana/web3.js@^1.95.0 @solana/spl-token@^0.4.14 bn.js@^5.2.1
```

## Runtime Expectations

The SDK is built around:

- `@solana/web3.js` v1.x
- Anchor `0.31.1`
- SPL Token-2022 via `@solana/spl-token`
- `bn.js` for counters, quotas, and amounts

## Supported Environments

### Good Fit

- Node.js scripts and backend services
- CLIs and admin tooling
- React or Next.js apps that already use `@solana/web3.js` and Anchor wallets

### Caveat

`OracleModule` imports Node's `crypto` module. In a browser-only bundle, that module may require a compatible runtime or polyfill.

## Minimum Node Version

Use Node `18+`.

## Import Pattern

```ts
import {Connection, Keypair} from "@solana/web3.js";
import {Wallet, BN} from "@coral-xyz/anchor";
import {
  SSSClient,
  StablecoinPreset,
  buildInitializeParams,
} from "solana-stablecoin-standard";
```

## Package Exports

The SDK exports:

- `SSSClient`
- PDA helpers
- account and instruction param types
- preset helpers
- error helpers
- event parsers
- oracle utilities
- program IDs and seed constants

See [SDK Client](./sdk/client) and [SDK Types](./sdk/types) for the full surface.
