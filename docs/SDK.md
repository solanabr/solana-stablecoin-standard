# TypeScript SDK Reference

Package: `@stbr/sss-token`

## Installation

```bash
npm install @stbr/sss-token
```

## SolanaStablecoin

### `SolanaStablecoin.create(options)`

Initialize a new stablecoin.

```typescript
const stable = await SolanaStablecoin.create({
  connection,           // Connection
  authority,            // Keypair — master authority
  preset,               // Preset.SSS_1 | Preset.SSS_2 (optional if extensions set)
  name,                 // string
  symbol,               // string
  uri?,                 // string — metadata URI
  decimals?,            // number (default: 6)
  mintKeypair?,         // Keypair (optional — generated if omitted)
  extensions?: {        // Override specific flags (ignored when preset provided)
    permanentDelegate?: boolean,
    transferHook?: boolean,
    defaultAccountFrozen?: boolean,
  }
});
```

### `SolanaStablecoin.load(connection, mint, authority)`

Load an existing stablecoin by mint address.

```typescript
const stable = await SolanaStablecoin.load(connection, mintPubkey, authority);
```

### Properties

```typescript
stable.connection  // Connection
stable.mint        // PublicKey
stable.statePDA    // PublicKey
stable.authority   // Keypair
stable.config      // StablecoinConfig
stable.compliance  // ComplianceModule (SSS-2)
```

### Core Methods

```typescript
// Mint tokens
await stable.mint({ recipient: PublicKey, amount: bigint, minter: Keypair }): Promise<string>

// Burn tokens
await stable.burn(from: PublicKey, amount: bigint): Promise<string>

// Freeze a token account
await stable.freeze(account: PublicKey): Promise<string>

// Unfreeze
await stable.thaw(account: PublicKey): Promise<string>

// Pause all minting/burning
await stable.pause(): Promise<string>
await stable.unpause(): Promise<string>

// Minter management
await stable.addMinter(minter: PublicKey, quota?: bigint, active?: boolean): Promise<string>
await stable.removeMinter(minter: PublicKey): Promise<string>

// Role management
await stable.updateRoles({
  pauser?: PublicKey | null,
  burner?: PublicKey | null,
  blacklister?: PublicKey | null,   // SSS-2
  seizer?: PublicKey | null,         // SSS-2
}): Promise<string>

// Authority transfer (two-step)
await stable.proposeAuthority(newAuthority: PublicKey): Promise<string>
await stable.acceptAuthority(newAuthorityKeypair: Keypair): Promise<string>
```

### Read-Only Methods

```typescript
// Get full on-chain state
await stable.getState(): Promise<StablecoinState>

// Get total circulating supply (minted - burned)
await stable.getTotalSupply(): Promise<bigint>

// Get Token-2022 mint info
await stable.getMintInfo(): Promise<Mint>
```

---

## ComplianceModule (SSS-2)

Available as `stable.compliance`. All methods throw if the stablecoin was initialized as SSS-1.

```typescript
// Add address to blacklist
await stable.compliance.blacklistAdd(address: PublicKey, reason: string): Promise<string>

// Remove address from blacklist
await stable.compliance.blacklistRemove(address: PublicKey, reason: string): Promise<string>

// Check if address is blacklisted (on-chain check)
await stable.compliance.isBlacklisted(address: PublicKey): Promise<boolean>

// Seize all tokens from blacklisted address to treasury
await stable.compliance.seize(frozenAccount: PublicKey, treasury: PublicKey): Promise<string>
```

---

## Presets

```typescript
import { Preset, Presets } from "@stbr/sss-token";

Preset.SSS_1    // "sss-1"
Preset.SSS_2    // "sss-2"
Preset.CUSTOM   // "custom"

// Presets is an alias for Preset
Presets.SSS_1   // same as Preset.SSS_1
```

---

## PDA Utilities

```typescript
import {
  findStatePDA,
  findMintAuthorityPDA,
  findFreezeAuthorityPDA,
  findPermanentDelegatePDA,
  findMinterInfoPDA,
  findBlacklistEntryPDA,
  SSS_TOKEN_PROGRAM_ID,
  TRANSFER_HOOK_PROGRAM_ID,
} from "@stbr/sss-token";

const [statePDA, bump] = findStatePDA(mintPubkey);
const [minterInfo] = findMinterInfoPDA(statePDA, minterPubkey);
const [blacklistEntry] = findBlacklistEntryPDA(statePDA, targetPubkey);
```

---

## Error Handling

All SDK methods throw with descriptive messages. Anchor errors are propagated with their message.

```typescript
try {
  await stable.mint({ ... });
} catch (e) {
  if (e.message.includes("paused")) {
    // Protocol is paused
  } else if (e.message.includes("QuotaExceeded")) {
    // Minter quota exceeded
  } else if (e.message.includes("SSS-2 compliance is not enabled")) {
    // Called SSS-2 method on SSS-1 token
  }
}
```