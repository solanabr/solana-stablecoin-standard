# SDK Reference

The `@stbr/sss-token` TypeScript SDK provides a high-level client for creating and managing stablecoins on Solana.

## Installation

```bash
pnpm add @stbr/sss-token
# or
npm install @stbr/sss-token
```

**Peer dependencies:** `@coral-xyz/anchor`, `@solana/web3.js`, `@solana/spl-token`

## Quick Start

```typescript
import { SSS } from "@stbr/sss-token";
import { AnchorProvider } from "@coral-xyz/anchor";

const provider = AnchorProvider.env();

// Create a new stablecoin
const sss = await SSS.create(provider, {
  preset: "sss-1",
  name: "My Dollar",
  symbol: "MUSD",
  decimals: 6,
});

// Load an existing stablecoin
const existing = await SSS.load(provider, mintPublicKey);
```

## Creating Stablecoins

### SSS-1: Minimal

```typescript
const sss = await SSS.create(provider, {
  preset: "sss-1",
  name: "Internal Token",
  symbol: "INTL",
  uri: "https://example.com/metadata.json",
  decimals: 6,
  supplyCap: 1_000_000_000_000n, // Optional, in base units
});
```

Token-2022 extensions: MetadataPointer, PermanentDelegate.

### SSS-2: Compliant

```typescript
const sss = await SSS.create(provider, {
  preset: "sss-2",
  name: "Regulated USD",
  symbol: "rUSD",
  decimals: 6,
});
```

Token-2022 extensions: MetadataPointer, PermanentDelegate, TransferHook, DefaultAccountState(Frozen).

New token accounts are frozen by default and must be thawed by a freezer before the holder can transact. Every transfer passes through the transfer hook for blacklist enforcement.

### SSS-3: Private

```typescript
const sss = await SSS.create(provider, {
  preset: "sss-3",
  name: "Private Dollar",
  symbol: "pUSD",
  decimals: 6,
});
```

Token-2022 extensions: MetadataPointer, PermanentDelegate, ConfidentialTransferMint.

An auditor ElGamal public key can be provided via `Sss3MintOptions.auditorElGamalPubkey` (32-byte `Uint8Array`). If omitted, a zero key is used (for testing).

### Custom Extensions

Instead of choosing a preset, specify which Token-2022 extensions to enable. The preset is inferred automatically:

```typescript
const custom = await SSS.create(provider, {
  name: "Custom Stable",
  symbol: "CUSD",
  decimals: 6,
  extensions: {
    permanentDelegate: true,
    transferHook: false,
    defaultAccountFrozen: false,
  },
});
// Inferred as SSS-1 (no transferHook, no confidentialTransfer)
```

### Custom Mint Keypair

```typescript
import { Keypair } from "@solana/web3.js";

const mintKeypair = Keypair.generate();
const sss = await SSS.create(provider, {
  preset: "sss-1",
  name: "My Token",
  symbol: "MTK",
}, mintKeypair);
```

## Token Operations

### Mint Tokens

Caller must have the `minter` role. Blocked when paused.

```typescript
const signature = await sss.mintTokens(
  recipientTokenAccount, // PublicKey of the token account
  1_000_000n,            // Amount in base units
);
```

### Burn Tokens

Caller must have the `minter` role (minters can burn). Burns via permanent delegate authority. Blocked when paused.

```typescript
const signature = await sss.burn(
  tokenAccount, // PublicKey of the token account to burn from
  500_000n,     // Amount in base units
);
```

### Freeze Account

Caller must have the `freezer` role. Blocked when paused.

```typescript
const signature = await sss.freeze(tokenAccount);
```

### Thaw Account

Caller must have the `freezer` role. Blocked when paused.

```typescript
const signature = await sss.thaw(tokenAccount);
```

### Pause

Caller must have the `pauser` role. Blocks mint, burn, freeze, and thaw. Does not block seize.

```typescript
const signature = await sss.pause();
```

### Unpause

Caller must have the `pauser` role. Restores normal operations.

```typescript
const signature = await sss.unpause();
```

### Seize

Admin-only. Forcibly transfers tokens using the permanent delegate. Works even when paused.

```typescript
const signature = await sss.seize(
  fromTokenAccount,
  toTokenAccount,
  1_000_000n,
);
```

### Update Supply Cap

Admin-only. Set a new supply cap or remove it entirely.

```typescript
// Set a new cap
await sss.updateSupplyCap(2_000_000_000n);

// Remove the cap
await sss.updateSupplyCap(null);
```

### Get Stablecoin Info

```typescript
const info = await sss.info();
// Returns: StablecoinInfo {
//   mint: PublicKey,
//   authority: PublicKey,
//   preset: "sss-1" | "sss-2" | "sss-3",
//   paused: boolean,
//   supplyCap: bigint | null,
//   totalMinted: bigint,
//   totalBurned: bigint,
//   currentSupply: bigint,
// }
```

## Role Management

### Grant a Role

Admin-only. Creates a role PDA for the grantee.

```typescript
await sss.roles.grant(walletPublicKey, "minter");
await sss.roles.grant(walletPublicKey, "freezer");
await sss.roles.grant(walletPublicKey, "pauser");
await sss.roles.grant(walletPublicKey, "admin");
```

Available roles: `"admin"`, `"minter"`, `"freezer"`, `"pauser"`

### Revoke a Role

Admin-only. Closes the role PDA and returns rent to the admin. Self-revocation of admin role is blocked to prevent permanent lockout.

```typescript
await sss.roles.revoke(walletPublicKey, "minter");
```

### Check a Role

Returns `true` if the role PDA exists on-chain.

```typescript
const hasMinterRole = await sss.roles.check(
  walletPublicKey,
  "minter",
);
```

## Blacklist Operations (SSS-2)

### Add to Blacklist

Admin-only. Creates a blacklist entry PDA.

```typescript
await sss.blacklist.add(
  walletPublicKey,
  "OFAC sanctioned address",
);
```

The reason string must be 128 characters or fewer.

### Remove from Blacklist

Admin-only. Closes the blacklist entry PDA.

```typescript
await sss.blacklist.remove(walletPublicKey);
```

### Check Blacklist Status

```typescript
const isBlacklisted = await sss.blacklist.check(walletPublicKey);
```

## Confidential Operations (SSS-3)

SSS-3 provides confidential transfer capabilities using Token-2022's ConfidentialTransferMint extension. Operations that move tokens between public and confidential states work from TypeScript. Operations that touch encrypted balances require a Rust proof service.

### Deposit (Public to Confidential)

No ZK proofs required. The amount is visible on-chain during deposit.

```typescript
await sss.confidential.deposit(
  tokenAccount,
  1_000_000n, // Amount
  6,          // Decimals
);
```

### Apply Pending Balance

No ZK proofs required. Credits pending deposits to the available confidential balance.

```typescript
await sss.confidential.applyPending(tokenAccount);
```

### Confidential Transfer

Requires Rust `solana-zk-sdk` for ZK proof generation. Not available in TypeScript.

```typescript
// This will throw -- proof service required
await sss.confidential.transfer(senderAccount, recipientAccount, amount);
```

### Withdraw (Confidential to Public)

Requires Rust `solana-zk-sdk` for ZK proof generation. Not available in TypeScript.

```typescript
// This will throw -- proof service required
await sss.confidential.withdraw(tokenAccount, amount, decimals);
```

### Test Helpers

For testing environments where actual encryption is not exercised:

```typescript
import {
  generateTestElGamalKeypair,
  generateTestAesKey,
} from "@stbr/sss-token";

const { publicKey, secretKey } = generateTestElGamalKeypair();
const aesKey = generateTestAesKey();
```

## PDA Helpers

```typescript
import {
  deriveConfigPda,
  deriveRolePda,
  deriveBlacklistPda,
  deriveExtraAccountMetasPda,
  SSS_CORE_PROGRAM_ID,
  SSS_HOOK_PROGRAM_ID,
} from "@stbr/sss-token";

const [configPda, bump] = deriveConfigPda(mintPublicKey);
const [rolePda] = deriveRolePda(configPda, walletPublicKey, "minter");
const [blacklistPda] = deriveBlacklistPda(mintPublicKey, walletPublicKey);
const [extraMetasPda] = deriveExtraAccountMetasPda(mintPublicKey);
```

## Instruction Builders

For advanced use cases, you can build individual instructions without sending:

```typescript
import {
  buildInitializeIx,
  buildMintTokensIx,
  buildBurnTokensIx,
  buildFreezeAccountIx,
  buildThawAccountIx,
  buildPauseIx,
  buildUnpauseIx,
  buildSeizeIx,
  buildGrantRoleIx,
  buildRevokeRoleIx,
  buildUpdateSupplyCapIx,
  buildInitializeExtraAccountMetasIx,
  buildAddToBlacklistIx,
  buildRemoveFromBlacklistIx,
} from "@stbr/sss-token";
```

These return `TransactionInstruction` objects that can be composed into custom transactions.

## Error Handling

The SDK maps Anchor program errors to typed TypeScript errors:

```typescript
import {
  SssError,
  PausedError,
  SupplyCapExceededError,
  UnauthorizedError,
  LastAdminError,
  SenderBlacklistedError,
} from "@stbr/sss-token";

try {
  await sss.mintTokens(account, amount);
} catch (err) {
  if (err instanceof PausedError) {
    console.log("Operations are paused");
  } else if (err instanceof SupplyCapExceededError) {
    console.log("Would exceed supply cap");
  } else if (err instanceof UnauthorizedError) {
    console.log("Missing required role");
  }
}
```

**All error classes extend `SssError`** and include a `code` property matching the on-chain error name:

| Error Class | Code | Program |
|---|---|---|
| `PausedError` | `Paused` | sss-core |
| `NotPausedError` | `NotPaused` | sss-core |
| `SupplyCapExceededError` | `SupplyCapExceeded` | sss-core |
| `UnauthorizedError` | `Unauthorized` | both |
| `InvalidPresetError` | `InvalidPreset` | sss-core |
| `LastAdminError` | `LastAdmin` | sss-core |
| `ArithmeticOverflowError` | `ArithmeticOverflow` | sss-core |
| `MintMismatchError` | `MintMismatch` | sss-core |
| `InvalidSupplyCapError` | `InvalidSupplyCap` | sss-core |
| `ZeroAmountError` | `ZeroAmount` | sss-core |
| `InvalidRoleError` | `InvalidRole` | sss-core |
| `SenderBlacklistedError` | `SenderBlacklisted` | sss-transfer-hook |
| `ReceiverBlacklistedError` | `ReceiverBlacklisted` | sss-transfer-hook |
| `ReasonTooLongError` | `ReasonTooLong` | sss-transfer-hook |

## Types

```typescript
type Preset = "sss-1" | "sss-2" | "sss-3";
type RoleType = "admin" | "minter" | "freezer" | "pauser";

interface StablecoinCreateOptions {
  preset: Preset;
  name: string;
  symbol: string;
  uri?: string;
  decimals?: number;     // Default: 6
  supplyCap?: bigint;    // Optional, in base units
}

interface StablecoinInfo {
  mint: PublicKey;
  authority: PublicKey;
  preset: Preset;
  paused: boolean;
  supplyCap: bigint | null;
  totalMinted: bigint;
  totalBurned: bigint;
  currentSupply: bigint;
}
```
