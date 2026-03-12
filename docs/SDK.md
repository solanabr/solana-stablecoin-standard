# SDK Reference

## Installation

```bash
npm install @stbr/sss-token
```

## Preset Initialization

```typescript
import { SolanaStablecoin, Preset } from "@stbr/sss-token";
import * as anchor from "@coral-xyz/anchor";

const provider = anchor.AnchorProvider.env();
const program = new anchor.Program(idl, provider);

// SSS-1: minimal stablecoin
const sss1 = await SolanaStablecoin.create(provider, program, {
  preset: Preset.SSS_1,
  name: "My Stablecoin",
  symbol: "MYUSD",
  decimals: 6,
});

// SSS-2: compliant stablecoin
const sss2 = await SolanaStablecoin.create(provider, program, {
  preset: Preset.SSS_2,
  name: "Regulated USD",
  symbol: "RUSD",
});
```

## Custom Config

```typescript
const custom = await SolanaStablecoin.create(provider, program, {
  name: "Custom Stable",
  symbol: "CUSD",
  decimals: 2,
  extensions: {
    permanentDelegate: true,
    transferHook: false,
    defaultAccountFrozen: false,
  },
});
```

## Loading Existing Stablecoins

```typescript
const stable = SolanaStablecoin.load(program, mintPublicKey);
const state = await stable.getState();
const supply = await stable.getTotalSupply();
```

## Minting

```typescript
// Grant minter role with optional cap
await stable.updateMinter(authority, minterPublicKey, {
  active: true,
  cap: 1_000_000_000n, // 1000 USDC (6 decimals)
});

// Mint tokens
await stable.mintTokens(minterKeypair, recipientPublicKey, 500_000n);
```

## Burning

```typescript
await stable.burnTokens(burnerKeypair, tokenAccountPublicKey, 100_000n);
```

## Freeze / Thaw

```typescript
await stable.freezeAccount(authority, tokenAccountPublicKey);
await stable.thawAccount(authority, tokenAccountPublicKey);
```

## Emergency Pause

```typescript
await stable.pause(authority);
await stable.unpause(authority);
```

## Role Management

```typescript
// Grant blacklister role
await stable.updateRole(authority, "Blacklister", complianceOfficerPublicKey, true);

// Grant seizer role
await stable.updateRole(authority, "Seizer", securityPublicKey, true);

// Revoke burner role
await stable.updateRole(authority, "Burner", oldBurnerPublicKey, false);
```

## SSS-2 Compliance

```typescript
// Check blacklist status
const blacklisted = await stable.compliance.isBlacklisted(address);

// Get blacklist entry details
const entry = await stable.compliance.getBlacklistEntry(address);
// entry.reason, entry.blacklistedBy, entry.timestamp

// Add to blacklist
await stable.compliance.blacklistAdd(authority, address, "OFAC SDN match");

// Remove from blacklist
await stable.compliance.blacklistRemove(authority, address);

// Get all blacklisted addresses
const all = await stable.compliance.getAllBlacklisted();

// Seize tokens (account must be frozen first)
await stable.compliance.seize(seizer, frozenAccount, treasuryAccount, amount);
```

## PDA Utilities

```typescript
import { findStablecoinStatePda, findMinterRecordPda, findBlacklistEntryPda } from "@stbr/sss-token";

const [statePda] = findStablecoinStatePda(mint);
const [minterRecord] = findMinterRecordPda(mint, minterPublicKey);
const [blacklistEntry] = findBlacklistEntryPda(mint, address);
```

## Types

```typescript
interface StablecoinConfig {
  name: string;
  symbol: string;
  uri: string;
  decimals: number;
  enablePermanentDelegate?: boolean;
  enableTransferHook?: boolean;
  defaultAccountFrozen?: boolean;
}

interface StablecoinStateAccount {
  mint: PublicKey;
  authority: PublicKey;
  preset: number; // 1 = SSS-1, 2 = SSS-2
  paused: boolean;
  enableTransferHook: boolean;
  enablePermanentDelegate: boolean;
  burners: PublicKey[];
  pausers: PublicKey[];
  blacklisters: PublicKey[];
  seizers: PublicKey[];
}

type RoleKind = "Burner" | "Pauser" | "Blacklister" | "Seizer";
```
