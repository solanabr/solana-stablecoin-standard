# @stbr/sss-token SDK Reference

## Installation

```bash
npm install @stbr/sss-token
# or
yarn add @stbr/sss-token
```

**Prerequisites:** The Anchor IDL must be compiled before the SDK can be used.

```bash
anchor build
```

---

## Quick Start (SSS-1)

```typescript
import { Connection, Keypair } from "@solana/web3.js";
import { SolanaStablecoin, Presets } from "@stbr/sss-token";

const connection = new Connection("https://api.devnet.solana.com", "confirmed");
const authority = Keypair.fromSecretKey(/* your key bytes */);

// Create a new SSS-1 stablecoin
const stable = await SolanaStablecoin.create(connection, {
  preset: Presets.SSS_1,
  name: "My USD",
  symbol: "MUSD",
  decimals: 6,
  authority,
});

console.log("Mint address:", stable.mintAddress.toBase58());

// Mint 1 MUSD to a recipient
const recipient = new PublicKey("...");
const sig = await stable.mint({ recipient, amount: 1_000_000n });
console.log("Mint tx:", sig);

// Check balance
const balance = await stable.getBalance(recipient);
console.log("Balance:", balance.toString()); // "1000000"

// Freeze an account
const tokenAccount = stable.getTokenAccount(recipient);
await stable.freezeAccount(tokenAccount);
```

---

## Quick Start (SSS-2)

```typescript
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { SolanaStablecoin, Presets } from "@stbr/sss-token";

const stable = await SolanaStablecoin.create(connection, {
  preset: Presets.SSS_2,
  name: "Compliant USD",
  symbol: "CUSD",
  decimals: 6,
  authority,
});

// Mint tokens to a user
await stable.mint({ recipient: userWallet, amount: 100_000_000n });

// Add a wallet to the blacklist - blocks all transfers immediately
await stable.compliance.blacklistAdd(sanctionedWallet, "OFAC SDN 2026-03-03");

// Check if an address is blacklisted
const isBlacklisted = await stable.compliance.isBlacklisted(sanctionedWallet);
console.log(isBlacklisted); // true

// Freeze the sanctioned account (belt and suspenders)
const ata = stable.getTokenAccount(sanctionedWallet);
await stable.freezeAccount(ata);

// Seize tokens via permanent delegate
const complianceTreasury = stable.getTokenAccount(treasuryWallet);
await stable.compliance.seize({
  from: ata,
  to: complianceTreasury,
  amount: 100_000_000n,
});
```

---

## API Reference

### `SolanaStablecoin.create(connection, options)`

Creates and initializes a new stablecoin mint on-chain.

**Signature:**
```typescript
static async create(
  connection: Connection,
  options: CreateOptions
): Promise<SolanaStablecoin>
```

**Parameters:**

| Field | Type | Required | Description |
|---|---|---|---|
| `connection` | `Connection` | Yes | Solana RPC connection |
| `options.preset` | `Presets.SSS_1 \| Presets.SSS_2` | No | Preset to use; defaults to SSS-1 behavior |
| `options.name` | `string` | Yes | Token name (max 32 bytes) |
| `options.symbol` | `string` | Yes | Token symbol (max 10 bytes) |
| `options.uri` | `string` | No | Metadata URI (max 200 bytes); default `""` |
| `options.decimals` | `number` | No | Decimal places; default `6` |
| `options.authority` | `Keypair` | Yes | Deploying keypair; becomes master authority |
| `options.enablePermanentDelegate` | `boolean` | No | Override preset; enables seizure |
| `options.enableTransferHook` | `boolean` | No | Override preset; enables blacklist hook |
| `options.defaultAccountFrozen` | `boolean` | No | New accounts start frozen (KYC mode) |

**Returns:** `Promise<SolanaStablecoin>` - Initialized instance with `mint` and `config` addresses set.

**Side effects:** For SSS-2, also calls `initialize_extra_account_meta_list` on the transfer hook program.

---

### `SolanaStablecoin.load(connection, authority, mint)`

Loads an existing stablecoin by its mint address.

**Signature:**
```typescript
static async load(
  connection: Connection,
  authority: Keypair,
  mint: PublicKey
): Promise<SolanaStablecoin>
```

**Parameters:**

| Parameter | Type | Description |
|---|---|---|
| `connection` | `Connection` | Solana RPC connection |
| `authority` | `Keypair` | Keypair that will sign transactions |
| `mint` | `PublicKey` | The Token-2022 mint address |

**Returns:** `Promise<SolanaStablecoin>`

**Throws:** `Error("IDL not found. Run \`anchor build\` first.")` if IDL is not compiled.

---

### `stable.mint(options)`

Mints tokens to a recipient. Creates the recipient's associated token account if it does not exist.

**Signature:**
```typescript
async mint(options: MintOptions): Promise<string>
```

**Parameters:**

| Field | Type | Required | Description |
|---|---|---|---|
| `options.recipient` | `PublicKey` | Yes | Wallet address to receive tokens |
| `options.amount` | `bigint` | Yes | Amount in base units (not decimal-adjusted) |
| `options.minter` | `Keypair` | No | If provided, signs as a delegated minter |

**Returns:** Transaction signature.

**Throws:** `ProgramPaused`, `Unauthorized`, `MinterInactive`, `QuotaExceeded`

---

### `stable.burn(from, amount)`

Burns tokens from a token account.

**Signature:**
```typescript
async burn(from: PublicKey, amount: bigint): Promise<string>
```

**Parameters:**

| Parameter | Type | Description |
|---|---|---|
| `from` | `PublicKey` | Token account to burn from |
| `amount` | `bigint` | Amount in base units |

**Returns:** Transaction signature.

---

### `stable.freezeAccount(tokenAccount)`

Freezes a token account.

**Signature:**
```typescript
async freezeAccount(tokenAccount: PublicKey): Promise<string>
```

**Parameters:**

| Parameter | Type | Description |
|---|---|---|
| `tokenAccount` | `PublicKey` | Token account to freeze |

**Returns:** Transaction signature.

---

### `stable.thawAccount(tokenAccount)`

Unfreezes a previously frozen token account.

**Signature:**
```typescript
async thawAccount(tokenAccount: PublicKey): Promise<string>
```

---

### `stable.pause()`

Globally pauses `mint_to` and `burn` for this stablecoin.

**Signature:**
```typescript
async pause(): Promise<string>
```

**Returns:** Transaction signature.

---

### `stable.unpause()`

Resumes normal operation after a pause.

**Signature:**
```typescript
async unpause(): Promise<string>
```

---

### `stable.addMinter(minter, quota?)`

Registers a minter with an optional cumulative quota.

**Signature:**
```typescript
async addMinter(minter: PublicKey, quota?: bigint): Promise<string>
```

**Parameters:**

| Parameter | Type | Default | Description |
|---|---|---|---|
| `minter` | `PublicKey` | - | Wallet address to grant minter role |
| `quota` | `bigint` | `0n` | Cumulative ceiling in base units; `0n` = unlimited |

**Returns:** Transaction signature.

---

### `stable.removeMinter(minter)`

Deactivates an existing minter. The PDA record is preserved for audit.

**Signature:**
```typescript
async removeMinter(minter: PublicKey): Promise<string>
```

---

### `stable.nominateAuthority(newAuthority)`

Step 1 of the two-step authority transfer. Writes a pending nominee.

**Signature:**
```typescript
async nominateAuthority(newAuthority: PublicKey): Promise<string>
```

**Throws:** `PendingAuthorityExists` if a nomination is already pending.

---

### `stable.acceptAuthority()`

Step 2 of the two-step authority transfer. Must be called by the new authority.

**Signature:**
```typescript
async acceptAuthority(): Promise<string>
```

**Note:** The SDK instance must be loaded with the new authority's keypair.

---

### `stable.getTotalSupply()`

Returns the current total supply of the stablecoin.

**Signature:**
```typescript
async getTotalSupply(): Promise<bigint>
```

**Returns:** Total circulating supply in base units.

---

### `stable.getBalance(wallet)`

Returns the token balance of a wallet.

**Signature:**
```typescript
async getBalance(wallet: PublicKey): Promise<bigint>
```

**Returns:** Balance in base units. Returns `0n` if the wallet has no token account.

---

### `stable.getTokenAccount(wallet)`

Derives the associated token account address for a wallet (off-chain, no RPC call).

**Signature:**
```typescript
getTokenAccount(wallet: PublicKey): PublicKey
```

**Returns:** Associated token account pubkey.

---

### `stable.refresh()`

Fetches and caches the current on-chain config state.

**Signature:**
```typescript
async refresh(): Promise<StablecoinConfigState>
```

**Returns:**

```typescript
interface StablecoinConfigState {
  authority: PublicKey;
  pendingAuthority: PublicKey | null;
  mint: PublicKey;
  paused: boolean;
  enablePermanentDelegate: boolean;
  enableTransferHook: boolean;
  defaultAccountFrozen: boolean;
  hookProgramId: PublicKey | null;
  bump: number;
}
```

---

## Compliance Module (SSS-2)

Access via `stable.compliance`. All methods throw `Sss2NotEnabled` if the mint was initialized without SSS-2 extensions.

### `stable.compliance.blacklistAdd(address, reason)`

Adds an address to the on-chain blacklist.

**Signature:**
```typescript
async blacklistAdd(address: PublicKey, reason: string): Promise<string>
```

**Parameters:**

| Parameter | Type | Constraint | Description |
|---|---|---|---|
| `address` | `PublicKey` | - | Wallet address to blacklist |
| `reason` | `string` | max 128 bytes | Human-readable reason (stored on-chain) |

**Returns:** Transaction signature.

**Effect:** Immediately blocks all transfers to/from this address via the transfer hook.

---

### `stable.compliance.blacklistRemove(address)`

Removes an address from the blacklist. The on-chain record is preserved but deactivated.

**Signature:**
```typescript
async blacklistRemove(address: PublicKey): Promise<string>
```

**Effect:** Immediately unblocks transfers for this address.

---

### `stable.compliance.seize(options)`

Forcibly transfers tokens from any account using the permanent delegate.

**Signature:**
```typescript
async seize(options: SeizeOptions): Promise<string>
```

**Parameters:**

```typescript
interface SeizeOptions {
  from: PublicKey;   // source token account
  to: PublicKey;     // destination token account
  amount: bigint;    // amount in base units
}
```

**Returns:** Transaction signature.

---

### `stable.compliance.isBlacklisted(address)`

Checks whether a wallet address is currently blacklisted.

**Signature:**
```typescript
async isBlacklisted(address: PublicKey): Promise<boolean>
```

**Returns:** `true` if a `BlacklistEntry` PDA exists and is `active`.

---

### `stable.compliance.getBlacklistEntry(address)`

Fetches full blacklist entry details for an address.

**Signature:**
```typescript
async getBlacklistEntry(address: PublicKey): Promise<BlacklistEntryState | null>
```

**Returns:**

```typescript
interface BlacklistEntryState {
  address: PublicKey;
  mint: PublicKey;
  reason: string;
  blacklistedAt: BN;       // Unix timestamp
  blacklistedBy: PublicKey;
  active: boolean;
  bump: number;
}
```

Returns `null` if no entry exists for the address.

---

## PDA Utilities

```typescript
import {
  getConfigAddress,
  getMinterAddress,
  getRoleAddress,
  getBlacklistAddress,
  getExtraAccountMetasAddress,
  deriveAddresses,
} from "@stbr/sss-token";
```

### `getConfigAddress(mint)`

```typescript
function getConfigAddress(mint: PublicKey): [PublicKey, number]
```

Derives the `StablecoinConfig` PDA. Seeds: `[b"config", mint]`.

### `getMinterAddress(mint, minter)`

```typescript
function getMinterAddress(mint: PublicKey, minter: PublicKey): [PublicKey, number]
```

Derives the `MinterRole` PDA. Seeds: `[b"minter", mint, minter]`.

### `getRoleAddress(mint, roleType, address)`

```typescript
function getRoleAddress(
  mint: PublicKey,
  roleType: number,   // 0=Blacklister, 1=Pauser, 2=Seizer, 3=Burner, 4=Freezer
  address: PublicKey
): [PublicKey, number]
```

Derives a `RoleEntry` PDA. Seeds: `[b"role", mint, roleType_byte, address]`.

### `getBlacklistAddress(mint, address)`

```typescript
function getBlacklistAddress(mint: PublicKey, address: PublicKey): [PublicKey, number]
```

Derives a `BlacklistEntry` PDA. Seeds: `[b"blacklist", mint, address]`.

### `getExtraAccountMetasAddress(mint)`

```typescript
function getExtraAccountMetasAddress(mint: PublicKey): [PublicKey, number]
```

Derives the `ExtraAccountMetaList` PDA owned by the `transfer_hook` program. Seeds: `[b"extra-account-metas", mint]`.

### `deriveAddresses(mint)`

```typescript
function deriveAddresses(mint: PublicKey): {
  config: PublicKey;
  configBump: number;
  extraAccountMetas: PublicKey;
}
```

Convenience function that derives the most commonly needed addresses.

---

## Constants

```typescript
import { SSS_TOKEN_PROGRAM_ID, TRANSFER_HOOK_PROGRAM_ID, Presets } from "@stbr/sss-token";

SSS_TOKEN_PROGRAM_ID   // GgcHf4khPVY28yVkQGDgBjaNLgsjNWGaNdfmL36wgPGp
TRANSFER_HOOK_PROGRAM_ID  // 6XUKT63WZFKU8Lvgydv9XeczoigNhag1JtvqkmV7nf47

Presets.SSS_1  // "sss-1"
Presets.SSS_2  // "sss-2"
```

## Role Type Constants

```typescript
import { RoleTypes } from "@stbr/sss-token";

RoleTypes.Blacklister  // { blacklister: {} }
RoleTypes.Pauser       // { pauser: {} }
RoleTypes.Seizer       // { seizer: {} }
RoleTypes.Burner       // { burner: {} }
RoleTypes.Freezer      // { freezer: {} }
```

Use these with `stable.addRole(RoleTypes.Blacklister, address)` (requires `addRole` to be wired in the SDK - use program.methods.addRole directly if needed).
