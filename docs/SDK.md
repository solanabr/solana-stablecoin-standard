# SDK Reference

The SSS SDK is a TypeScript package (`@sss/sdk`) that provides typed client classes for all sss-core and sss-hook instructions, PDA derivation helpers, and type definitions for all on-chain accounts.

## Installation

```bash
yarn add @sss/sdk
# or
npm install @sss/sdk
```

**Peer dependencies:** `@coral-xyz/anchor ^0.32.1`, `@solana/web3.js ^1.95.0`, `@solana/spl-token ^0.4.0`

## StablecoinClient

`StablecoinClient` wraps all sss-core instructions. Use it for SSS-1 deployments or for core operations on SSS-2 deployments.

```typescript
import { StablecoinClient } from "@sss/sdk";
import { Connection } from "@solana/web3.js";
import { Wallet } from "@coral-xyz/anchor";

const client = new StablecoinClient(connection, wallet);
// Optional: override program ID for a custom deployment
const client = new StablecoinClient(connection, wallet, customProgramId);
```

### Constructor

```typescript
new StablecoinClient(
  connection: Connection,
  wallet: Wallet,
  programId?: PublicKey   // defaults to SSS_CORE_PROGRAM_ID
)
```

### initialize

Creates a new stablecoin mint and `StablecoinConfig` account. Generates a fresh mint keypair internally.

```typescript
async initialize(
  params: InitializeParams,
  hookProgram?: PublicKey    // required when params.preset === 2
): Promise<InitializeResult>
```

`InitializeParams`:

| Field | Type | Description |
|---|---|---|
| `preset` | `number` | `1` = SSS-1 (Minimal), `2` = SSS-2 (Compliant) |
| `name` | `string` | Human-readable name, max 32 characters |
| `symbol` | `string` | Ticker symbol, max 10 characters |
| `uri` | `string` | Off-chain metadata URI, max 200 characters |
| `decimals` | `number` | Decimal places, 0–9 |

`InitializeResult`:

| Field | Type | Description |
|---|---|---|
| `mint` | `PublicKey` | Newly created mint address |
| `config` | `PublicKey` | StablecoinConfig PDA address |
| `txSig` | `string` | Transaction signature |

### configureMinter

Creates or updates a minter's quota. Only callable by the `master_minter` role.

```typescript
async configureMinter(
  mint: PublicKey,
  minterWallet: PublicKey,
  quota: BN           // maximum lifetime mint allowance in base units
): Promise<string>    // transaction signature
```

### removeMinter

Disables an existing minter. The `MinterState` account is preserved for audit purposes. Only callable by `master_minter`.

```typescript
async removeMinter(
  mint: PublicKey,
  minterWallet: PublicKey
): Promise<string>
```

### mint

Mints tokens to a destination token account. The signer must be a configured, enabled minter with sufficient remaining quota.

```typescript
async mint(
  mint: PublicKey,
  destination: PublicKey,   // Token-2022 token account (ATA or otherwise)
  amount: BN
): Promise<string>
```

### burn

Burns tokens from the signer's own ATA. Any token holder can burn. Not callable when paused.

```typescript
async burn(
  mint: PublicKey,
  amount: BN
): Promise<string>
```

### freezeAccount

Freezes a token account. Callable by `authority` or `blacklister`. Works even when paused.

```typescript
async freezeAccount(
  mint: PublicKey,
  targetTokenAccount: PublicKey
): Promise<string>
```

### thawAccount

Thaws a frozen token account. Callable by `authority` or `blacklister`. Works even when paused.

```typescript
async thawAccount(
  mint: PublicKey,
  targetTokenAccount: PublicKey
): Promise<string>
```

### pause

Pauses all minting, burning, and (for SSS-2) transfers. Only callable by `pauser`.

```typescript
async pause(mint: PublicKey): Promise<string>
```

### unpause

Resumes operations after a pause. Only callable by `pauser`.

```typescript
async unpause(mint: PublicKey): Promise<string>
```

### updateRole

Reassigns one of the three delegatable roles. Only callable by `authority`.

```typescript
async updateRole(
  mint: PublicKey,
  role: RoleType,        // RoleType.MasterMinter | RoleType.Pauser | RoleType.Blacklister
  newAddress: PublicKey
): Promise<string>
```

### transferAuthority

Initiates a two-step authority transfer. The new authority must call `acceptAuthority` to complete. Only callable by the current `authority`.

```typescript
async transferAuthority(
  mint: PublicKey,
  newAuthority: PublicKey
): Promise<string>
```

### acceptAuthority

Accepts a pending authority transfer. Must be called by the pending authority (the wallet nominated by `transferAuthority`).

```typescript
async acceptAuthority(mint: PublicKey): Promise<string>
```

### seize

Seizes tokens from a source account using the permanent delegate (SSS-2 only). Only callable by `authority`. The caller must include the hook's extra accounts as remaining accounts; the SDK resolves these automatically.

```typescript
async seize(
  mint: PublicKey,
  sourceTokenAccount: PublicKey,
  destinationTokenAccount: PublicKey,
  amount: BN
): Promise<string>
```

### getConfig

Fetches and deserializes the `StablecoinConfig` account for a given mint.

```typescript
async getConfig(mint: PublicKey): Promise<StablecoinConfig>
```

### getMinterState

Fetches and deserializes the `MinterState` account for a given mint and minter wallet.

```typescript
async getMinterState(
  mint: PublicKey,
  minterWallet: PublicKey
): Promise<MinterState>
```

---

## ComplianceClient

`ComplianceClient` extends `StablecoinClient` with all sss-hook instructions. Use it for SSS-2 deployments.

```typescript
import { ComplianceClient } from "@sss/sdk";

const client = new ComplianceClient(connection, wallet);
// Optional: override both program IDs
const client = new ComplianceClient(
  connection, wallet, customCoreProgramId, customHookProgramId
);
```

### Constructor

```typescript
new ComplianceClient(
  connection: Connection,
  wallet: Wallet,
  programId?: PublicKey,       // defaults to SSS_CORE_PROGRAM_ID
  hookProgramId?: PublicKey    // defaults to SSS_HOOK_PROGRAM_ID
)
```

All `StablecoinClient` methods are inherited.

### initializeHook

Initializes the transfer hook for an SSS-2 mint. Creates the `HookConfig` and `ExtraAccountMetaList` PDAs. Must be called after `initialize()` and before tokens begin circulating.

```typescript
async initializeHook(mint: PublicKey): Promise<string>
```

### addToBlacklist

Adds a wallet to the blacklist. Creates the `BlacklistEntry` PDA. Only callable by `blacklister`.

```typescript
async addToBlacklist(
  mint: PublicKey,
  wallet: PublicKey,
  reason: string    // max 200 characters (CLI), max 64 bytes stored on-chain
): Promise<string>
```

### removeFromBlacklist

Removes a wallet from the blacklist (sets `blacklisted = false`). Only callable by `blacklister`.

```typescript
async removeFromBlacklist(
  mint: PublicKey,
  wallet: PublicKey
): Promise<string>
```

### isBlacklisted

Returns `true` if the wallet has an active blacklist entry. Returns `false` if the `BlacklistEntry` PDA does not exist or `blacklisted` is false.

```typescript
async isBlacklisted(
  mint: PublicKey,
  wallet: PublicKey
): Promise<boolean>
```

### getBlacklistEntry

Fetches the full `BlacklistEntry` for a wallet. Returns `null` if no entry exists.

```typescript
async getBlacklistEntry(
  mint: PublicKey,
  wallet: PublicKey
): Promise<BlacklistEntry | null>
```

### getHookConfig

Fetches the `HookConfig` account for a given mint. Returns `null` if the hook has not been initialized.

```typescript
async getHookConfig(mint: PublicKey): Promise<HookConfig | null>
```

---

## PDA Helper Functions

```typescript
import {
  findConfigPda,
  findMintAuthorityPda,
  findMinterStatePda,
  findHookConfigPda,
  findBlacklistEntryPda,
  findExtraAccountMetaListPda,
} from "@sss/sdk";
```

All helpers return `[PublicKey, number]` (address, bump).

| Function | Seeds | Program default |
|---|---|---|
| `findConfigPda(mint, programId?)` | `["config", mint]` | SSS_CORE_PROGRAM_ID |
| `findMintAuthorityPda(mint, programId?)` | `["mint-authority", mint]` | SSS_CORE_PROGRAM_ID |
| `findMinterStatePda(config, minter, programId?)` | `["minter", config, minter]` | SSS_CORE_PROGRAM_ID |
| `findHookConfigPda(mint, programId?)` | `["hook-config", mint]` | SSS_HOOK_PROGRAM_ID |
| `findBlacklistEntryPda(mint, wallet, programId?)` | `["blacklist", mint, wallet]` | SSS_HOOK_PROGRAM_ID |
| `findExtraAccountMetaListPda(mint, programId?)` | `["extra-account-metas", mint]` | SSS_HOOK_PROGRAM_ID |

---

## Types Reference

### StablecoinConfig

```typescript
interface StablecoinConfig {
  mint: PublicKey;
  preset: number;              // 1 = SSS-1, 2 = SSS-2
  authority: PublicKey;
  pendingAuthority: PublicKey;
  masterMinter: PublicKey;
  pauser: PublicKey;
  blacklister: PublicKey;
  paused: boolean;
  totalMinted: BN;
  totalBurned: BN;
  bump: number;
  mintAuthorityBump: number;
}
```

### MinterState

```typescript
interface MinterState {
  config: PublicKey;
  minter: PublicKey;
  quota: BN;
  mintedAmount: BN;
  enabled: boolean;
  bump: number;
}
```

### HookConfig

```typescript
interface HookConfig {
  mint: PublicKey;
  stablecoinConfig: PublicKey;
  coreProgram: PublicKey;
  bump: number;
}
```

### BlacklistEntry

```typescript
interface BlacklistEntry {
  mint: PublicKey;
  wallet: PublicKey;
  blacklisted: boolean;
  reason: string;
  blacklistedAt: BN;     // Unix timestamp (seconds)
  blacklistedBy: PublicKey;
  bump: number;
}
```

### InitializeParams / InitializeResult

```typescript
interface InitializeParams {
  preset: number;
  name: string;
  symbol: string;
  uri: string;
  decimals: number;
}

interface InitializeResult {
  mint: PublicKey;
  config: PublicKey;
  txSig: string;
}
```

### RoleType

```typescript
enum RoleType {
  MasterMinter = "MasterMinter",
  Pauser = "Pauser",
  Blacklister = "Blacklister",
}
```

### Constants

```typescript
import {
  SSS_CORE_PROGRAM_ID,   // PublicKey: CZzvCtyZC8KR37DNDeGYpwN46YEc7WEh6RyeSRdhjY4Y
  SSS_HOOK_PROGRAM_ID,   // PublicKey: 9aw7Ac4aGMMfND3BvYgGEcASuvyJiBXnQizbhNBphcNM
  PRESET_MINIMAL,        // 1
  PRESET_COMPLIANT,      // 2
  CONFIG_SEED,           // "config"
  MINT_AUTHORITY_SEED,   // "mint-authority"
  MINTER_SEED,           // "minter"
  HOOK_CONFIG_SEED,      // "hook-config"
  BLACKLIST_SEED,        // "blacklist"
  EXTRA_ACCOUNT_METAS_SEED, // "extra-account-metas"
  TOKEN_2022_PROGRAM_ID, // re-exported from @solana/spl-token
} from "@sss/sdk";
```

---

## Usage Examples

### Initialize an SSS-1 stablecoin

```typescript
import { StablecoinClient, PRESET_MINIMAL } from "@sss/sdk";
import { Connection, clusterApiUrl } from "@solana/web3.js";

const connection = new Connection(clusterApiUrl("devnet"), "confirmed");
const client = new StablecoinClient(connection, wallet);

const { mint, config, txSig } = await client.initialize({
  preset: PRESET_MINIMAL,
  name: "My USD",
  symbol: "MUSD",
  uri: "https://example.com/musd-metadata.json",
  decimals: 6,
});

console.log("Mint:", mint.toBase58());
console.log("Config:", config.toBase58());
```

### Configure a minter and mint tokens

```typescript
import { BN } from "@coral-xyz/anchor";
import {
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountInstruction,
  TOKEN_2022_PROGRAM_ID,
} from "@solana/spl-token";

// Grant minter a quota of 1,000,000 MUSD (6 decimals → 1_000_000_000_000 base units)
await client.configureMinter(mint, minterWallet, new BN("1000000000000"));

// Create destination ATA (standard SPL token setup)
const destAta = getAssociatedTokenAddressSync(
  mint, recipientWallet, false, TOKEN_2022_PROGRAM_ID
);

// Mint 100 MUSD
await client.mint(mint, destAta, new BN("100000000"));
```

### Burn tokens

```typescript
// Burns from the signer's own ATA
await client.burn(mint, new BN("50000000")); // 50 MUSD
```

### Freeze and thaw accounts

```typescript
// Freeze an account (callable by authority or blacklister)
await client.freezeAccount(mint, targetTokenAccount);

// Thaw it later
await client.thawAccount(mint, targetTokenAccount);
```

### Pause and unpause

```typescript
// Halt all minting, burning, and transfers
await client.pause(mint);

// Resume
await client.unpause(mint);
```

### Initialize an SSS-2 stablecoin with transfer hook

```typescript
import { ComplianceClient, PRESET_COMPLIANT, SSS_HOOK_PROGRAM_ID } from "@sss/sdk";

const compliance = new ComplianceClient(connection, wallet);

// Step 1: initialize the mint (preset 2 requires hookProgram)
const { mint, config } = await compliance.initialize(
  {
    preset: PRESET_COMPLIANT,
    name: "Compliant USD",
    symbol: "CUSD",
    uri: "https://example.com/cusd.json",
    decimals: 6,
  },
  SSS_HOOK_PROGRAM_ID
);

// Step 2: initialize the hook (creates HookConfig + ExtraAccountMetaList)
await compliance.initializeHook(mint);
```

### Blacklist management

```typescript
// Add a wallet to the blacklist
await compliance.addToBlacklist(
  mint,
  suspectWallet,
  "Matched OFAC sanctions list"
);

// Check status
const blocked = await compliance.isBlacklisted(mint, suspectWallet);
console.log("Blocked:", blocked); // true

// Get full entry
const entry = await compliance.getBlacklistEntry(mint, suspectWallet);
console.log("Reason:", entry?.reason);
console.log("Blacklisted at:", new Date(entry!.blacklistedAt.toNumber() * 1000));

// Remove from blacklist
await compliance.removeFromBlacklist(mint, suspectWallet);
```

### Seize tokens (SSS-2)

```typescript
// Seize 500 CUSD from a blacklisted account into the authority's treasury account
await compliance.seize(
  mint,
  blacklistedTokenAccount,    // source
  authorityTokenAccount,      // destination (treasury)
  new BN("500000000")         // 500 CUSD
);
```

### Role management

```typescript
import { RoleType } from "@sss/sdk";

// Delegate the pauser role to an operations key
await client.updateRole(mint, RoleType.Pauser, operationsWallet);

// Delegate master_minter to a separate treasury key
await client.updateRole(mint, RoleType.MasterMinter, treasuryWallet);

// Initiate authority transfer (two-step)
await client.transferAuthority(mint, newAdminWallet);
// newAdminWallet must now call:
await newAdminClient.acceptAuthority(mint);
```
