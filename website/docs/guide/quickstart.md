---
sidebar_position: 3
title: Quickstart
description: Create and operate your first SSS stablecoin
---

# Quickstart

This walkthrough creates a stablecoin, configures roles, and executes a mint flow.

## 1) Initialize Client

```ts
import { Connection, Keypair } from '@solana/web3.js';
import { SSSClient, Preset, BackingType, BankingRail, Role } from '@sss/sdk';

const connection = new Connection('https://api.devnet.solana.com', 'confirmed');
const authority = Keypair.generate();
const client = new SSSClient(connection, authority.publicKey);
```

## 2) Create Stablecoin

```ts
const { mint, configPda } = await client.initialize({
  name: 'Example USD',
  symbol: 'xUSD',
  decimals: 6,
  preset: Preset.Sss2,
  supplyCap: 1_000_000_000_000_000n,
  backingType: BackingType.Fiat,
  bankingRail: BankingRail.Swift,
  uri: 'https://example.com/metadata.json',
});
```

## 3) Grant Minter Role

```ts
await client.updateRoles({
  target: authority.publicKey,
  role: Role.Minter,
  active: true,
  config: configPda,
});

await client.updateMinterConfig({
  minter: authority.publicKey,
  quota: 1_000_000_000n,
  config: configPda,
});
```

## 4) Mint Tokens

```ts
await client.mintTokens({
  amount: 100_000_000n,
  recipient: authority.publicKey,
  config: configPda,
});
```

## 5) Perform Administrative Controls

```ts
await client.pause({ config: configPda });
await client.unpause({ config: configPda });
```

## CLI Equivalent

```bash
sss init --name "Example USD" --symbol xUSD --preset sss2
sss roles grant --config <CONFIG_PDA> --target <PUBKEY> --role minter
sss mint --config <CONFIG_PDA> --amount 100000000 --recipient <PUBKEY>
```

## Production Note

Use managed key custody or multisig for authority in production. Avoid hot-wallet authority for live issuance.

## Next Step

Continue with [Token Standards](./token-standards) to choose the correct compliance profile.
