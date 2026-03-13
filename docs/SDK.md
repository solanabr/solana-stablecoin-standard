# SDK Reference

> **Package**: `@stbr/sss-token`  
> **Install**: `npm install @stbr/sss-token`

## Quick Start

```typescript
import { SolanaStablecoin, Presets } from "@stbr/sss-token";
import { Connection, Keypair } from "@solana/web3.js";
import { Wallet } from "@coral-xyz/anchor";

const connection = new Connection("https://api.devnet.solana.com");
const wallet = new Wallet(Keypair.fromSecretKey(/* ... */));
```

## Preset Initialization

```typescript
// SSS-1: Minimal stablecoin
const sss1 = await SolanaStablecoin.create(connection, wallet, {
  preset: Presets.SSS_1,
  name: "Simple USD",
  symbol: "sUSD",
  decimals: 6,
});

// SSS-2: Compliant stablecoin (permanent delegate + blacklist)
const sss2 = await SolanaStablecoin.create(connection, wallet, {
  preset: Presets.SSS_2,
  name: "Regulated USD",
  symbol: "rUSD",
  decimals: 6,
});

// SSS-3: Private stablecoin (confidential transfers)
const sss3 = await SolanaStablecoin.create(connection, wallet, {
  preset: Presets.SSS_3,
  name: "Private USD",
  symbol: "pUSD",
  decimals: 6,
});
```

## Custom Configuration

```typescript
const custom = await SolanaStablecoin.create(connection, wallet, {
  name: "Custom Stable",
  symbol: "CUSD",
  decimals: 6,
  uri: "https://example.com/metadata.json",
  extensions: {
    permanentDelegate: true,
    transferHook: false,       // Blacklist checks disabled
    defaultAccountFrozen: true,
    confidentialTransfers: false,
  },
  roles: {
    pauser: pauserPubkey,
    blacklister: blacklisterPubkey,
    seizer: seizerPubkey,
  },
});
```

## Connecting to Existing Token

```typescript
const stable = SolanaStablecoin.connect(connection, mintAddress, wallet);
const config = await stable.getConfig();
```

## Core Operations

### Mint

```typescript
await stable.mint({
  recipient: userPubkey,
  amount: BigInt(1_000_000), // 1.0 at 6 decimals
  minter: minterKeypair,     // optional, defaults to wallet
});
```

### Burn

```typescript
await stable.burn({
  amount: BigInt(500_000),
  burner: burnerKeypair,     // optional
});
```

### Freeze / Thaw

```typescript
await stable.freeze({ address: suspectWallet });
await stable.thaw({ address: clearedWallet });
```

### Pause / Unpause

```typescript
await stable.pause();    // pauser or master authority
await stable.unpause();  // master authority only
```

## Role Management

```typescript
// Add minter with quota
await stable.updateMinter({
  minter: minterPubkey,
  quota: BigInt(10_000_000_000), // 10,000 tokens
});

// Remove minter
await stable.removeMinter(minterPubkey);

// Update roles
await stable.updateRoles({
  newPauser: newPauserPubkey,
  addBurner: newBurnerPubkey,
});

// Transfer authority (⚠️ irreversible)
await stable.transferAuthority(newAuthorityPubkey);
```

## Compliance (SSS-2)

```typescript
// Blacklist
await stable.compliance.blacklistAdd(address, "OFAC match");
await stable.compliance.blacklistRemove(address);

// Query
const blocked = await stable.compliance.isBlacklisted(address);
const entry = await stable.compliance.getBlacklistEntry(address);

// Seize (from frozen, blacklisted account)
await stable.compliance.seize(frozenAddress, treasuryWallet);
```

## Queries

```typescript
const config = await stable.getConfig();
const roles = await stable.getRoles();
const supply = await stable.getTotalSupply();

// Direct accessors
const mint = stable.getMint();
const configPda = stable.getConfigPda();
const rolesPda = stable.getRolesPda();
```

## Standalone Account Fetchers

Use these without a client instance:

```typescript
import {
  fetchStablecoinConfig,
  fetchRoleManager,
  fetchBlacklistEntry,
  deriveConfigPda,
  deriveRolesPda,
  deriveBlacklistPda,
} from "@stbr/sss-token";

const [configPda] = deriveConfigPda(mintAddress);
const config = await fetchStablecoinConfig(connection, configPda);

const [rolesPda] = deriveRolesPda(configPda);
const roles = await fetchRoleManager(connection, rolesPda);

const [blacklistPda] = deriveBlacklistPda(configPda, suspectAddress);
const entry = await fetchBlacklistEntry(connection, blacklistPda);
```

## Exports

```typescript
// Client
export { SolanaStablecoin } from "./client";
export { ComplianceManager } from "./compliance";

// Account fetchers
export { fetchStablecoinConfig, fetchRoleManager, fetchBlacklistEntry } from "./accounts";

// Presets
export { Presets, getPresetConfig } from "./presets";

// PDA helpers
export { deriveConfigPda, deriveRolesPda, deriveBlacklistPda, deriveAllPdas } from "./constants";

// Constants
export { SSS_TOKEN_PROGRAM_ID, TRANSFER_HOOK_PROGRAM_ID, ORACLE_MODULE_PROGRAM_ID } from "./constants";

// Types (all re-exported)
export type { StablecoinConfig, RoleManager, MinterEntry, BlacklistEntry, ... } from "./types";
```
