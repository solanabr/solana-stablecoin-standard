# SDK Reference (@stbr/sss-token)

## Installation

```bash
npm install @stbr/sss-token @coral-xyz/anchor @solana/web3.js @solana/spl-token
```

## Initialization

### Using a preset

```typescript
import { SolanaStablecoin, Presets } from "@stbr/sss-token";

// SSS-1: Minimal Stablecoin
const stable1 = await SolanaStablecoin.create(connection, {
  preset: Presets.SSS_1,
  name: "My Stablecoin",
  symbol: "MYUSD",
  decimals: 6,
  authority: adminKeypair,
});

// SSS-2: Compliant Stablecoin
const stable2 = await SolanaStablecoin.create(connection, {
  preset: Presets.SSS_2,
  name: "Compliant USD",
  symbol: "CUSD",
  decimals: 6,
  authority: adminKeypair,
});
```

### Custom configuration

```typescript
const custom = await SolanaStablecoin.create(connection, {
  name: "Custom Stable",
  symbol: "CUST",
  decimals: 6,
  authority: adminKeypair,
  enablePermanentDelegate: true,
  enableTransferHook: false, // hook without permanent delegate
  defaultAccountFrozen: true, // new accounts start frozen (KYC workflow)
  burner: burnRoleKeypair.publicKey,
  pauser: pauseRoleKeypair.publicKey,
});
```

### Load existing stablecoin

```typescript
const stable = await SolanaStablecoin.load(
  connection,
  mintPublicKey,
  authorityKeypair
);
```

## Core Operations

### Mint

```typescript
await stable.mint(
  { recipient: userPublicKey, amount: 1_000_000n }, // 1 MYUSD at 6 decimals
  minterKeypair
);
```

### Burn

```typescript
await stable.burn(
  {
    tokenAccount: userTokenAccount,
    tokenAccountOwner: userPublicKey,
    amount: 500_000n,
  },
  burnerKeypair
);
```

### Freeze / Thaw

```typescript
await stable.freeze(userTokenAccount, authorityKeypair);
await stable.thaw(userTokenAccount, authorityKeypair);
```

### Pause / Unpause

```typescript
await stable.pause(authorityKeypair);
await stable.unpause(authorityKeypair);
```

### Transfer Authority

```typescript
await stable.transferAuthority(newAuthorityPubkey, currentAuthorityKeypair);
```

## Minters Module

```typescript
// Add a minter with a quota (0 = unlimited)
await stable.minters.add(
  { minter: minterPubkey, quota: 10_000_000_000n, active: true },
  authorityKeypair
);

// List all minters
const minters = await stable.minters.list();
for (const m of minters) {
  console.log(m.minter.toBase58(), m.quota.toString(), m.active);
}

// Deactivate a minter
await stable.minters.remove(minterPubkey, authorityKeypair);
```

## Compliance Module (SSS-2)

The `.compliance` property throws `NotCompliantPresetError` on SSS-1 mints.

```typescript
// Add to blacklist
await stable.compliance.blacklistAdd(
  suspiciousAddress,
  "OFAC sanctions match",
  blacklisterKeypair
);

// Check blacklist status
const isBlacklisted = await stable.compliance.isBlacklisted(address);

// List all blacklisted addresses
const entries = await stable.compliance.listBlacklisted();

// Remove from blacklist
await stable.compliance.blacklistRemove(address, blacklisterKeypair);

// Seize tokens
await stable.compliance.seize(
  {
    fromTokenAccount: frozenTokenAccount,
    toTokenAccount: treasuryTokenAccount,
    amount: 500_000_000n,
  },
  seizerKeypair
);
```

## Queries

```typescript
// Get full status
const status = await stable.getStatus();
// { mint, name, symbol, decimals, paused, preset, supply, authority }

// Get total supply
const supply = await stable.getTotalSupply(); // bigint

// Get raw config
const config = await stable.getConfig();
```

## PDA Utilities

```typescript
import { findConfigPda, findMinterPda, findBlacklistPda } from "@stbr/sss-token";

const [configPda, bump] = findConfigPda(mint, programId);
const [minterPda] = findMinterPda(mint, minterPubkey, programId);
const [blacklistPda] = findBlacklistPda(mint, address, programId);
```

## Error Handling

```typescript
import { NotCompliantPresetError, QuotaExceededError } from "@stbr/sss-token";

try {
  await stable.compliance.blacklistAdd(address, "test", keypair);
} catch (e) {
  if (e instanceof NotCompliantPresetError) {
    console.error("This operation requires SSS-2 preset");
  }
}
```
