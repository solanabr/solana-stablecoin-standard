# TypeScript SDK Reference

## Installation

```bash
npm install @stbr/sss-token
# or
yarn add @stbr/sss-token
```

## Quick Start

### Create a Stablecoin (SSS-1)

```typescript
import { SolanaStablecoin, Presets } from "@stbr/sss-token";
import { Connection, Keypair } from "@solana/web3.js";

const connection = new Connection("https://api.devnet.solana.com");
const authority = Keypair.generate();

const stable = await SolanaStablecoin.create(connection, {
  preset: Presets.SSS_1,
  name: "My Token",
  symbol: "MYTKN",
  decimals: 6,
  authority,
});
```

### Create a Stablecoin (SSS-2)

```typescript
const stable = await SolanaStablecoin.create(connection, {
  preset: Presets.SSS_2,
  name: "Regulated USD",
  symbol: "RUSD",
  decimals: 6,
  authority,
});
```

### Custom Configuration

```typescript
const stable = await SolanaStablecoin.create(connection, {
  name: "Custom Stable",
  symbol: "CUSD",
  decimals: 6,
  authority,
  extensions: {
    permanentDelegate: true,
    transferHook: false,
  },
});
```

### Load Existing Stablecoin

```typescript
const stable = await SolanaStablecoin.load(
  connection,
  mintPublicKey,
  authority
);
```

## Core Operations

### Mint

```typescript
const sig = await stable.mint({
  recipient: recipientPubkey,
  amount: 1_000_000, // 1.0 MUSD (6 decimals)
  minter: minterKeypair,
});
```

### Burn

```typescript
const sig = await stable.burn({
  amount: 500_000,
  burner: burnerKeypair,
});
```

### Freeze / Thaw

```typescript
await stable.freezeAccount({
  tokenAccount: targetAta,
  freezer: freezerKeypair,
});

await stable.thawAccount({
  tokenAccount: targetAta,
  freezer: freezerKeypair,
});
```

### Pause / Unpause

```typescript
await stable.pause(pauserKeypair);
await stable.unpause(pauserKeypair);
```

## Role Management

```typescript
import { ROLE_FLAGS } from "@stbr/sss-token";

// Grant minter role
await stable.updateRoles(targetPubkey, ROLE_FLAGS.MINTER, true, authority);

// Setup minter with quota (1M tokens)
await stable.updateMinter(minterPubkey, 1_000_000_000n, true, authority);

// Check roles
const roles = await stable.getRoles(targetPubkey);
console.log(roles?.isMinter); // true
```

## Compliance (SSS-2)

```typescript
// Check blacklist
const isBlacklisted = await stable.compliance.isBlacklisted(address);

// Add to blacklist
await stable.compliance.blacklistAdd({
  address: targetPubkey,
  reason: "OFAC SDN match",
  blacklister: blacklisterKeypair,
});

// Remove from blacklist
await stable.compliance.blacklistRemove(targetPubkey, blacklisterKeypair);

// Seize tokens
await stable.compliance.seize({
  fromTokenAccount: frozenAta,
  toTokenAccount: treasuryAta,
  seizer: seizerKeypair,
});
```

## View Functions

```typescript
// Total supply
const supply = await stable.getTotalSupply();
console.log(supply.currentSupply);  // bigint
console.log(supply.totalMinted);    // bigint
console.log(supply.totalBurned);    // bigint

// Stablecoin info
const info = await stable.getInfo();
console.log(info.name, info.symbol, info.paused);

// Minter info
const minter = await stable.getMinter(minterPubkey);
console.log(minter?.quota, minter?.minted, minter?.active);
```

## Presets

| Preset | `enablePermanentDelegate` | `enableTransferHook` | `defaultAccountFrozen` |
|--------|---------------------------|----------------------|------------------------|
| SSS-1 | `false` | `false` | `false` |
| SSS-2 | `true` | `true` | `false` |

## Types

See `src/types.ts` for complete type definitions including:
- `StablecoinCreateParams`
- `StablecoinInfo`
- `MintParams` / `BurnParams`
- `FreezeParams` / `ThawParams`
- `BlacklistParams` / `SeizeParams`
- `RoleInfo` / `MinterInfo`
- `SupplyInfo`
- `ROLE_FLAGS`
