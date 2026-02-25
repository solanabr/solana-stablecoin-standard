# SDK Reference

The TypeScript SDK (`@stbr/sss-sdk`) provides a high-level client for the SSS Token program. It handles PDA derivation, account resolution, and Anchor RPC calls.

## Installation

The SDK is a Yarn workspace package within this monorepo. Build with `yarn install && yarn build`. Peer dependencies: `@coral-xyz/anchor ^0.31.1`, `@solana/spl-token ^0.4.10`, `@solana/web3.js ^1.98.0`.

## Creating a Stablecoin

```typescript
import { Connection, Keypair } from "@solana/web3.js";
import { SolanaStablecoin } from "@stbr/sss-sdk";

const connection = new Connection("https://api.devnet.solana.com", "confirmed");
const authority = Keypair.fromSecretKey(/* ... */);
const mint = Keypair.generate();

// SSS-1: minimal stablecoin
const coin = await SolanaStablecoin.create(connection, authority, mint, {
  name: "USD Backed",
  symbol: "USDB",
  decimals: 6,
  preset: "sss-1",
});

// SSS-2: compliant stablecoin (permanent delegate + transfer hook + default-frozen)
const coin2 = await SolanaStablecoin.create(connection, authority, mint, {
  name: "USD Backed",
  symbol: "USDB",
  decimals: 6,
  preset: "sss-2",
});
```

SSS-2 initialization registers the transfer hook by passing the hook program ID and `ExtraAccountMetaList` PDA as remaining accounts. The SDK handles this automatically.

## Loading an Existing Stablecoin

```typescript
const coin = await SolanaStablecoin.load(connection, new PublicKey("MintAddress..."));
```

`load` verifies the `StablecoinConfig` PDA exists. Throws if the mint is not managed by the SSS Token program.

---

## SolanaStablecoin Methods

### `SolanaStablecoin.create`

```typescript
static async create(
  connection: Connection,
  authority: Keypair,
  mint: Keypair,
  config: CreateConfig
): Promise<SolanaStablecoin>
```

Deploys a new stablecoin. Creates the Token-2022 mint, `StablecoinConfig` PDA, and `RoleManager` PDA in one transaction.

### `SolanaStablecoin.load`

```typescript
static async load(connection: Connection, mint: PublicKey): Promise<SolanaStablecoin>
```

Loads an existing stablecoin by mint address.

### `getInfo`

```typescript
async getInfo(): Promise<StablecoinInfo>
```

Fetches the current `StablecoinConfig` state from the chain.

```typescript
const info = await coin.getInfo();
console.log(info.paused);                   // boolean
console.log(info.totalMinted);              // bigint (raw units)
console.log(info.enablePermanentDelegate);  // true for SSS-2
```

### `addMinter`

```typescript
async addMinter(authority: Keypair, minter: PublicKey, quota: bigint): Promise<string>
```

Grants the Minter role and creates a `MinterInfo` PDA. Pass `0n` for unlimited minting. Only the master authority may call this.

```typescript
await coin.addMinter(authority, minterWallet, 1_000_000n * 10n ** 6n);
```

### `mintTokens`

```typescript
async mintTokens(minter: Keypair, recipient: PublicKey, amount: bigint): Promise<string>
```

Mints raw token units to the recipient's ATA (creates the ATA if needed). For SSS-2 tokens, the new ATA starts frozen — call `thawAccount` before the recipient can transfer.

```typescript
await coin.mintTokens(minter, recipientWallet, 100n * 10n ** 6n);
```

### `burnTokens`

```typescript
async burnTokens(burner: Keypair, amount: bigint): Promise<string>
```

Burns raw token units from the burner's own ATA. Caller must hold the Burner role.

### `freezeAccount`

```typescript
async freezeAccount(authority: Keypair, tokenAccount: PublicKey): Promise<string>
```

Freezes a specific token account. Pass the token account address, not the wallet address. Caller must be the master authority or hold the Pauser role.

```typescript
import { getAssociatedTokenAddressSync, TOKEN_2022_PROGRAM_ID } from "@solana/spl-token";

const tokenAccount = getAssociatedTokenAddressSync(
  coin.mintAddress, walletAddress, false, TOKEN_2022_PROGRAM_ID
);
await coin.freezeAccount(authority, tokenAccount);
```

### `thawAccount`

```typescript
async thawAccount(authority: Keypair, tokenAccount: PublicKey): Promise<string>
```

Unfreezes a previously frozen token account. Same role requirements as `freezeAccount`.

### `pause` / `unpause`

```typescript
async pause(authority: Keypair): Promise<string>
async unpause(authority: Keypair): Promise<string>
```

Sets or clears the global pause flag. While paused, `mintTokens` and `burnTokens` are blocked. Caller must be the master authority or hold the Pauser role.

### `transferAuthority`

```typescript
async transferAuthority(authority: Keypair, newAuthority: PublicKey): Promise<string>
```

Atomically transfers master authority to `newAuthority`. Irreversible without the new authority's cooperation. Verify the new address before signing.

### `getTotalSupply`

```typescript
async getTotalSupply(): Promise<bigint>
```

Returns the circulating supply (totalMinted - totalBurned) in raw token units.

```typescript
const supply = await coin.getTotalSupply(); // e.g. 1_000_000n for 1.0 USDB
```

### `mint` (convenience)

```typescript
async mint(params: { recipient: PublicKey; amount: bigint; minter: Keypair }): Promise<string>
```

Object-style wrapper around `mintTokens`. Matches the bounty spec API.

```typescript
await coin.mint({ recipient: walletPk, amount: 1_000_000n, minter: minterKp });
```

### `burn` (convenience)

```typescript
async burn(params: { amount: bigint; burner: Keypair }): Promise<string>
```

Object-style wrapper around `burnTokens`.

### `getMinters`

```typescript
async getMinters(): Promise<MinterInfoEntry[]>
```

Returns all registered minters with their quota and minted amounts. Each entry:

```typescript
interface MinterInfoEntry {
  address: PublicKey;
  quota: bigint;   // 0n = unlimited
  minted: bigint;
}
```

### `removeMinter`

```typescript
async removeMinter(authority: Keypair, minter: PublicKey): Promise<string>
```

Removes a minter from the role list. Only the master authority may call this.

### `compliance` (getter)

```typescript
get compliance(): ComplianceModule
```

Returns the `ComplianceModule` for SSS-2 operations. Calling any method on an SSS-1 token throws. Check `(await coin.getInfo()).enablePermanentDelegate` to detect the preset.

---

## ComplianceModule Methods (SSS-2 only)

Access via `coin.compliance`.

### `addToBlacklist`

```typescript
async addToBlacklist(blacklister: Keypair, address: PublicKey, reason: string): Promise<string>
```

Creates a `BlacklistEntry` PDA for `address`. The transfer hook rejects all transfers involving this address while the PDA exists. Caller must hold the Blacklister role. `reason` is stored on-chain (max 64 chars).

```typescript
await coin.compliance.addToBlacklist(blacklister, suspectWallet, "sanctions screening");
```

### `removeFromBlacklist`

```typescript
async removeFromBlacklist(blacklister: Keypair, address: PublicKey): Promise<string>
```

Closes the `BlacklistEntry` PDA. The address can transact again once this confirms.

### `blacklistAdd` (convenience alias)

```typescript
async blacklistAdd(address: PublicKey, reason: string, blacklister: Keypair): Promise<string>
```

Alias for `addToBlacklist` with reordered parameters matching the bounty spec API.

### `blacklistRemove` (convenience alias)

```typescript
async blacklistRemove(address: PublicKey, blacklister: Keypair): Promise<string>
```

Alias for `removeFromBlacklist` with reordered parameters.

### `isBlacklisted`

```typescript
async isBlacklisted(address: PublicKey): Promise<boolean>
```

Returns `true` if a live `BlacklistEntry` PDA exists for this address and mint.

### `seize`

```typescript
async seize(
  seizer: Keypair,
  fromTokenAccount: PublicKey,
  toTokenAccount: PublicKey,
  amount: bigint
): Promise<string>
```

Transfers tokens from a frozen token account to a treasury using the permanent delegate. Caller must hold the Seizer role. The source account must be frozen. The SDK resolves token account owners from chain data and builds the required hook remaining accounts automatically.

```typescript
await coin.compliance.seize(seizerKeypair, frozenTokenAccount, treasuryTokenAccount, 500n * 10n ** 6n);
```

---

## PDA Derivation Helpers

```typescript
import {
  deriveStablecoinConfig,    // seeds: ["stablecoin", mint]         → sss-token
  deriveRoleManager,         // seeds: ["roles", config]            → sss-token
  deriveMinterInfo,          // seeds: ["minter", config, minter]   → sss-token
  deriveBlacklistEntry,      // seeds: ["blacklist", mint, address] → sss-token
  deriveExtraAccountMetaList // seeds: ["extra-account-metas", mint]→ transfer-hook
} from "@stbr/sss-sdk";
```

All helpers return `Promise<[PublicKey, number]>` (address, bump).

---

## Types

```typescript
interface CreateConfig {
  name: string;                        // max 32 chars
  symbol: string;                      // max 10 chars
  decimals?: number;                   // default 6
  uri?: string;                        // default ""
  preset?: "sss-1" | "sss-2";         // default "sss-1"
  transferHookProgramId?: PublicKey;   // advanced: override hook program
}

interface StablecoinInfo {
  mint: PublicKey;
  config: PublicKey;
  authority: PublicKey;
  name: string;
  symbol: string;
  uri: string;
  decimals: number;
  paused: boolean;
  enablePermanentDelegate: boolean;
  enableTransferHook: boolean;
  enableDefaultFrozen: boolean;
  totalMinted: bigint;
  totalBurned: bigint;
}
```

---

## Error Handling

SDK methods throw Anchor `AnchorError` instances. Inspect `err?.error?.errorCode?.code` for the `SSSError` variant:

```typescript
try {
  await coin.mintTokens(minter, recipient, amount);
} catch (err) {
  if (err?.error?.errorCode?.code === "QuotaExceeded") {
    console.error("Minter quota exhausted");
  } else if (err?.error?.errorCode?.code === "Paused") {
    console.error("Token is globally paused");
  } else { throw err; }
}
```

| Code | Message |
|---|---|
| `Paused` | Token operations are paused |
| `Unauthorized` | Caller does not have the required role |
| `QuotaExceeded` | Minter quota exceeded |
| `ComplianceNotEnabled` | Compliance module not enabled for this token |
| `AlreadyBlacklisted` | Address is already blacklisted |
| `NotBlacklisted` | Address is not blacklisted |
| `AccountNotFrozen` | Cannot seize from an account that is not frozen |
| `RoleCapacityReached` | Maximum role capacity reached |
| `UseDedicatedAddMinter` | Use add_minter instruction to add minters |
| `AlreadyHasRole` | Address already holds this role |
