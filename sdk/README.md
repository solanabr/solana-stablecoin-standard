# @sss/sdk

TypeScript SDK for the Solana Stablecoin Standard (SSS).

## Installation

```bash
npm install @sss/sdk @coral-xyz/anchor @solana/web3.js @solana/spl-token
```

## Quick Start

```typescript
import { AnchorProvider } from "@coral-xyz/anchor";
import { SolanaStablecoin, Preset, Role } from "@sss/sdk";
import { BN } from "bn.js";

const provider = AnchorProvider.env();
const sdk = new SolanaStablecoin(provider, idl);

// Create an SSS-2 stablecoin (with transfer hook + permanent delegate)
const { mint, config } = await sdk.createMint({
  name: "Regulated USD",
  symbol: "RUSD",
  uri: "",
  decimals: 6,
  preset: Preset.SSS2,
  transferHookProgram: SSS_TRANSFER_HOOK_PROGRAM_ID,
  treasury: treasuryPubkey,
});

// Initialize transfer hook (required for SSS-2/SSS-3)
await sdk.initializeHook(mint);
```

## Presets

| Preset | Extensions | Use Case |
|--------|-----------|----------|
| `SSS1` | MetadataPointer, TokenMetadata | Basic stablecoin |
| `SSS2` | + PermanentDelegate, TransferHook, DefaultAccountState(Frozen) | Regulated stablecoin with compliance |
| `SSS3` | + ConfidentialTransferMint | Privacy-preserving regulated stablecoin |

## Roles

| Role | Value | Capabilities |
|------|-------|-------------|
| `Minter` | 0 | Mint tokens (with allowance) |
| `Burner` | 1 | Burn tokens from any account (permanent delegate) |
| `Seizer` | 2 | Seize tokens (thaw → burn → freeze → mint to treasury) |
| `Pauser` | 3 | Pause/unpause the stablecoin |
| `ComplianceOfficer` | 4 | Freeze/thaw token accounts |

## API Reference

### Core Operations

#### `createMint(params: CreateMintParams)`

Creates a new stablecoin mint with the specified preset.

```typescript
const { signature, mint, config } = await sdk.createMint({
  name: "My Stablecoin",
  symbol: "MUSD",
  uri: "https://example.com/metadata.json",
  decimals: 6,
  preset: Preset.SSS2,
  transferHookProgram: hookProgramId, // required for SSS-2/SSS-3
  treasury: treasuryPubkey,           // required for SSS-2/SSS-3
});
```

#### `mintTo(params: MintToParams)`

Mints tokens to a recipient. Caller must have the Minter role. Decrements allowance if set.

```typescript
await sdk.mintTo({
  mint: mintPubkey,
  to: recipientAta,
  amount: new BN(1_000_000),
});
```

#### `burnFrom(params: BurnFromParams)`

Burns tokens from any account using the permanent delegate. Caller must have the Burner role.

```typescript
await sdk.burnFrom({
  mint: mintPubkey,
  from: targetAta,
  amount: new BN(500_000),
});
```

#### `seize(params: SeizeParams)`

Atomically seizes tokens: thaw → burn → freeze → mint to treasury. Caller must have the Seizer role.

```typescript
await sdk.seize({
  mint: mintPubkey,
  from: targetAta,
  treasuryAta: treasuryAta,
  amount: new BN(100_000),
});
```

### Role Management

#### `grantRole(params: GrantRoleParams)`

Grants a role to a holder. Admin only.

```typescript
await sdk.grantRole({
  mint: mintPubkey,
  holder: minterPubkey,
  role: Role.Minter,
  allowance: new BN(1_000_000), // 0 = unlimited
});
```

#### `revokeRole(mint, holder, role)`

Revokes a role from a holder. Admin only.

```typescript
await sdk.revokeRole(mintPubkey, holderPubkey, Role.Minter);
```

#### `incrementAllowance(mint, minterHolder, amount)`

Increments a minter's allowance. Admin only.

```typescript
await sdk.incrementAllowance(mintPubkey, minterPubkey, new BN(500_000));
```

### Compliance

#### `blacklist(params: BlacklistParams)`

Blacklists a wallet. Blacklisted wallets cannot send or receive transfers. Admin only.

```typescript
await sdk.blacklist({ mint: mintPubkey, wallet: targetPubkey });
```

#### `unblacklist(params: BlacklistParams)`

Removes a wallet from the blacklist. Admin only.

```typescript
await sdk.unblacklist({ mint: mintPubkey, wallet: targetPubkey });
```

#### `freezeAccount(mint, tokenAccount)`

Freezes a token account. Requires ComplianceOfficer role.

```typescript
await sdk.freezeAccount(mintPubkey, tokenAccountPubkey);
```

#### `thawAccount(mint, tokenAccount)`

Thaws a frozen token account. Requires ComplianceOfficer role.

```typescript
await sdk.thawAccount(mintPubkey, tokenAccountPubkey);
```

### Pause/Unpause

#### `pause(mint, roleAccount?)`

Pauses the stablecoin. Admin or Pauser role.

```typescript
await sdk.pause(mintPubkey);
// or with Pauser role:
await sdk.pause(mintPubkey, pauserRoleAccountPubkey);
```

#### `unpause(mint, roleAccount?)`

Unpauses the stablecoin. Admin or Pauser role.

```typescript
await sdk.unpause(mintPubkey);
```

### Admin Transfer

#### `transferAdmin(mint, newAdmin)`

Initiates a two-step admin transfer. Sets pending admin.

```typescript
await sdk.transferAdmin(mintPubkey, newAdminPubkey);
```

#### `acceptAdmin(mint)`

Accepts the admin transfer. Must be called by the pending admin.

```typescript
await sdk.acceptAdmin(mintPubkey);
```

### Hook Initialization

#### `initializeHook(mint)`

Initializes the transfer hook config and extra account meta list. Required after creating an SSS-2/SSS-3 mint.

```typescript
await sdk.initializeHook(mintPubkey);
```

### Query Methods

#### `getStablecoinInfo(mint): StablecoinInfo`

Fetches the stablecoin configuration.

```typescript
const info = await sdk.getStablecoinInfo(mintPubkey);
// info.admin, info.paused, info.totalMinted, info.totalSeized, etc.
```

#### `getRoleInfo(mint, holder, role): RoleInfo | null`

Fetches role information for a holder. Returns null if role not granted.

```typescript
const role = await sdk.getRoleInfo(mintPubkey, minterPubkey, Role.Minter);
if (role) {
  console.log("Allowance:", role.allowance.toString());
}
```

#### `isBlacklisted(mint, wallet): boolean`

Checks if a wallet is blacklisted.

```typescript
const blacklisted = await sdk.isBlacklisted(mintPubkey, walletPubkey);
```

## PDA Utilities

```typescript
import {
  findConfigPda,
  findRolePda,
  findHookConfigPda,
  findBlacklistEntryPda,
  findExtraAccountMetaListPda,
  SSS_CORE_PROGRAM_ID,
  SSS_TRANSFER_HOOK_PROGRAM_ID,
} from "@sss/sdk";

const [configPda] = findConfigPda(mintPubkey);
const [rolePda] = findRolePda(configPda, holderPubkey, Role.Minter);
const [hookConfig] = findHookConfigPda(mintPubkey);
const [blacklistEntry] = findBlacklistEntryPda(hookConfig, walletPubkey);
const [extraMetas] = findExtraAccountMetaListPda(mintPubkey);
```

## Types

```typescript
interface CreateMintParams {
  name: string;
  symbol: string;
  uri: string;
  decimals: number;
  preset: Preset;
  transferHookProgram?: PublicKey;
  treasury?: PublicKey;
}

interface StablecoinInfo {
  admin: PublicKey;
  pendingAdmin: PublicKey;
  mint: PublicKey;
  preset: number;
  paused: boolean;
  transferHookProgram: PublicKey;
  treasury: PublicKey;
  totalMinted: BN;
  totalBurned: BN;
  totalSeized: BN;
}

interface RoleInfo {
  config: PublicKey;
  holder: PublicKey;
  role: Role;
  allowance: BN;
}
```
