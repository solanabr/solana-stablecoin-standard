# SDK Guide

## Installation

```bash
npm install @stbr/sss-token
```

## Quick Start

```typescript
import { SSSStablecoin, RoleType } from "@stbr/sss-token";
import { BN } from "@coral-xyz/anchor";

const stablecoin = new SSSStablecoin(program);

const { mint } = await stablecoin.initialize(
  {
    name: "USD Stablecoin",
    symbol: "USDS",
    uri: "https://example.com/metadata.json",
    decimals: 6,
    rolesEnabled: true,
    freezeEnabled: true,
  },
  admin
);

await stablecoin.grantRole(mint.publicKey, minterAuthority, RoleType.Minter, admin);
await stablecoin.mintTokens(mint.publicKey, destinationAta, new BN(1_000_000), minterAuthority);
```

## Optional Compliance Hook Module

```typescript
await stablecoin.initializeHookModule(mint.publicKey, admin);
await stablecoin.initializeExtraAccountMetaList(mint.publicKey, admin);
await stablecoin.addToBlacklist(mint.publicKey, address, admin);
await stablecoin.setComplianceMode(mint.publicKey, admin, true);
```

## PDA Helpers

```typescript
import {
  findConfigPda,
  findRolePda,
  findHookConfigPda,
  findBlacklistPda,
  findExtraAccountMetaListPda,
} from "@stbr/sss-token";
```
