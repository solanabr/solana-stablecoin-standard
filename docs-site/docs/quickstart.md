---
title: Quickstart
sidebar_position: 2
description: Install the SDK, connect to Solana devnet, and initialize an SSS stablecoin with the real API.
---

# Quickstart

This is the shortest source-accurate path to an SSS-2 mint on devnet.

## 1. Install

```bash
npm install solana-stablecoin-standard@0.2.1 @coral-xyz/anchor @solana/web3.js @solana/spl-token bn.js
```

## 2. Initialize A Stablecoin In Under 20 Lines

```ts
import {Connection, Keypair} from "@solana/web3.js";
import {Wallet} from "@coral-xyz/anchor";
import {
  SSSClient,
  StablecoinPreset,
  buildInitializeParams,
} from "solana-stablecoin-standard";

const connection = new Connection("https://api.devnet.solana.com", "confirmed");
const wallet = new Wallet(Keypair.generate());
const client = new SSSClient(connection, wallet);
const mint = Keypair.generate();
const params = buildInitializeParams("Demo USD", "dUSD", "https://example.com/meta.json", 6, StablecoinPreset.SSS2);

await client.initialize(params, mint, client.hookProgramId);
await client.initializeExtraAccountMetaList(mint.publicKey);
console.log(mint.publicKey.toBase58());
```

## 3. What Just Happened

- `buildInitializeParams(...)` mapped `SSS2` to the preset enum plus default feature flags
- `client.initialize(...)` created the Token-2022 mint and the `StablecoinConfig` and `RoleRegistry` PDAs
- `client.initializeExtraAccountMetaList(...)` enabled the transfer hook account resolution required for SSS-2 transfers

## 4. Next Step: Add A Minter

Minting does not work until a master authority registers at least one minter.

```ts
import {BN} from "@coral-xyz/anchor";

await client.updateMinter(mint.publicKey, wallet.publicKey, {
  isActive: true,
  mintQuota: new BN(1_000_000_000_000),
});
```

Then create the recipient ATA and call [`mintTokens`](./guides/mint-burn).

## Devnet Checklist

- the wallet must hold SOL for rent and fees
- SSS-2 mints must call `initializeExtraAccountMetaList` once
- quotas are in base units, not UI token units
