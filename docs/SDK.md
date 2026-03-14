# SDK and CLI Reference

The SSS SDK provides a TypeScript client library and command-line tool for interacting with the Solana Stablecoin Standard programs.

**Package:** `sdk/core`
**Entry point:** `sdk/core/src/index.ts`
**CLI binary:** `sss-token`

---

## Table of Contents

- [SolanaStablecoin Class](#solana-stablecoin-class)
- [ComplianceApi](#complianceapi)
- [RolesApi](#rolesapi)
- [PDA Helpers](#pda-helpers)
- [Types](#types)
- [Presets](#presets)
- [CLI Reference](#cli-reference)

---

## SolanaStablecoin Class

The main entry point for SDK usage. Provides factory methods for creating and loading stablecoins, plus methods for all core operations.

### Constructor

The constructor is private. Use `create()` or `load()`.

### Properties

| Property | Type | Description |
|----------|------|-------------|
| `config` | `StablecoinConfig` | Local config snapshot |
| `program` | `Program` | Anchor program instance |
| `mint` | `PublicKey` | Token-2022 mint address |
| `configAddress` | `PublicKey` | Config PDA address |
| `configBump` | `number` | Config PDA bump |
| `compliance` | `ComplianceApi` | Compliance operations (SSS-2) |
| `roles` | `RolesApi` | Role management operations |

### create()

Create and initialize a new stablecoin on-chain.

```typescript
static async create(
  program: Program,
  params: CreateStablecoinParams,
): Promise<{
  stablecoin: SolanaStablecoin;
  txSignature: string;
  mintKeypair: Keypair;
}>
```

**Example:**

```typescript
import { SolanaStablecoin, Presets } from "@sss/core";

const { stablecoin, txSignature, mintKeypair } = await SolanaStablecoin.create(
  program,
  {
    preset: Presets.SSS_1,
    name: "My Stablecoin",
    symbol: "MYST",
    decimals: 6,
  },
);
```

### load()

Load an existing stablecoin from on-chain state.

```typescript
static async load(
  program: Program,
  mint: PublicKey,
): Promise<SolanaStablecoin>
```

**Example:**

```typescript
const stablecoin = await SolanaStablecoin.load(program, mintPublicKey);
const status = await stablecoin.getStatus();
```

### mint()

Mint tokens to a recipient. Caller must have the minter role and sufficient quota.

```typescript
async mint(params: MintParams): Promise<string>
```

**Example:**

```typescript
const tx = await stablecoin.mint({
  recipient: recipientTokenAccount,
  amount: new BN(1_000_000),
});
```

### burn()

Burn tokens from the caller's token account.

```typescript
async burn(params: BurnParams): Promise<string>
```

**Example:**

```typescript
const tx = await stablecoin.burn({ amount: new BN(500_000) });
```

### freezeAccount()

Freeze a token account. Caller must have the freezer role.

```typescript
async freezeAccount(targetTokenAccount: PublicKey): Promise<string>
```

### thawAccount()

Thaw a frozen token account. Caller must have the freezer role.

```typescript
async thawAccount(targetTokenAccount: PublicKey): Promise<string>
```

### pause()

Pause the stablecoin. Authority only.

```typescript
async pause(): Promise<string>
```

### unpause()

Unpause the stablecoin. Authority only.

```typescript
async unpause(): Promise<string>
```

### proposeAuthority()

Step 1 of two-step authority transfer.

```typescript
async proposeAuthority(newAuthority: PublicKey): Promise<string>
```

### acceptAuthority()

Step 2 of two-step authority transfer. Must be called by the proposed authority.

```typescript
async acceptAuthority(): Promise<string>
```

### cancelAuthorityTransfer()

Cancel a pending authority transfer.

```typescript
async cancelAuthorityTransfer(): Promise<string>
```

### setMetadata()

Update a token metadata field.

```typescript
async setMetadata(field: string, value: string): Promise<string>
```

**Supported fields:** `"name"`, `"symbol"`, `"uri"`, or any custom key.

### getTotalSupply()

Get current total supply (total_minted - total_burned).

```typescript
async getTotalSupply(): Promise<BN>
```

### getStatus()

Get full on-chain status.

```typescript
async getStatus(): Promise<StablecoinStatus>
```

**Returns:**

```typescript
{
  mint: PublicKey;
  authority: PublicKey;
  pendingAuthority: PublicKey | null;
  paused: boolean;
  complianceEnabled: boolean;
  totalMinted: BN;
  totalBurned: BN;
  supplyCap: BN;
  enableAllowlist: boolean;
}
```

---

## ComplianceApi

Accessed via `stablecoin.compliance`. Provides SSS-2 compliance operations.

### addToBlacklist()

Add an address to the blacklist. Caller must have the blacklister role.

```typescript
async addToBlacklist(address: PublicKey): Promise<string>
```

### removeFromBlacklist()

Remove an address from the blacklist. Caller must have the blacklister role.

```typescript
async removeFromBlacklist(address: PublicKey): Promise<string>
```

### seize()

Atomic seizure: thaw, burn from source, refreeze, mint to treasury.

```typescript
async seize(params: SeizeParams & { targetOwner: PublicKey }): Promise<string>
```

**Example:**

```typescript
const tx = await stablecoin.compliance.seize({
  from: sourceTokenAccount,     // blacklisted user's token account
  to: treasuryTokenAccount,     // treasury's token account
  amount: new BN(1_000_000),
  targetOwner: blacklistedWallet, // wallet owner of source
});
```

### isBlacklisted()

Check if an address is on the blacklist.

```typescript
async isBlacklisted(address: PublicKey): Promise<boolean>
```

**Example:**

```typescript
if (await stablecoin.compliance.isBlacklisted(userWallet)) {
  console.log("Address is blacklisted");
}
```

### addToAllowlist()

Add an address to the allowlist. Authority only. Requires `enableAllowlist = true`.

```typescript
async addToAllowlist(address: PublicKey): Promise<string>
```

### removeFromAllowlist()

Remove an address from the allowlist. Authority only. Closes the AllowlistEntry PDA and returns rent.

```typescript
async removeFromAllowlist(address: PublicKey): Promise<string>
```

### isAllowlisted()

Check if an address is on the allowlist.

```typescript
async isAllowlisted(address: PublicKey): Promise<boolean>
```

---

## RolesApi

Accessed via `stablecoin.roles`. Provides role management operations.

### grantRole()

Grant a role to an address. Authority only.

```typescript
async grantRole(role: number, holder: PublicKey): Promise<string>
```

**Role constants:**

```typescript
import {
  ROLE_ADMIN,       // 0
  ROLE_MINTER,      // 1
  ROLE_PAUSER,      // 2
  ROLE_FREEZER,     // 3
  ROLE_BLACKLISTER, // 4 (SSS-2 only)
  ROLE_SEIZER,      // 5 (SSS-2 only)
} from "@sss/core";
```

### revokeRole()

Revoke a role from an address. Authority only. Closes the PDA and returns rent.

```typescript
async revokeRole(role: number, holder: PublicKey): Promise<string>
```

### setQuota()

Set or update a minter's quota. Authority only. The minter must already have the minter role.

```typescript
async setQuota(minter: PublicKey, quotaLimit: BN): Promise<string>
```

### hasRole()

Check if an address holds a specific role.

```typescript
async hasRole(role: number, holder: PublicKey): Promise<boolean>
```

### getQuota()

Get a minter's quota information.

```typescript
async getQuota(minter: PublicKey): Promise<QuotaInfo | null>
```

**Returns:**

```typescript
{
  config: PublicKey;
  minter: PublicKey;
  quotaLimit: BN;
  mintedAmount: BN;
} | null
```

---

## PDA Helpers

All PDA derivation functions are synchronous and deterministic.

### getConfigAddress()

```typescript
function getConfigAddress(
  programId: PublicKey,
  mint: PublicKey,
): [PublicKey, number]
```

Seeds: `["config", mint.toBuffer()]`

### getRoleAddress()

```typescript
function getRoleAddress(
  programId: PublicKey,
  role: number,
  holder: PublicKey,
): [PublicKey, number]
```

Seeds: `["role", Buffer.from([role]), holder.toBuffer()]`

### getQuotaAddress()

```typescript
function getQuotaAddress(
  programId: PublicKey,
  config: PublicKey,
  minter: PublicKey,
): [PublicKey, number]
```

Seeds: `["quota", config.toBuffer(), minter.toBuffer()]`

### getBlacklistAddress()

```typescript
function getBlacklistAddress(
  programId: PublicKey,
  config: PublicKey,
  address: PublicKey,
): [PublicKey, number]
```

Seeds: `["blacklist", config.toBuffer(), address.toBuffer()]`

### getExtraAccountMetasAddress()

```typescript
function getExtraAccountMetasAddress(
  hookProgramId: PublicKey,
  mint: PublicKey,
): [PublicKey, number]
```

Seeds: `["extra-account-metas", mint.toBuffer()]`

### getAllowlistAddress()

```typescript
function getAllowlistAddress(
  programId: PublicKey,
  config: PublicKey,
  address: PublicKey,
): [PublicKey, number]
```

Seeds: `["allowlist", config.toBuffer(), address.toBuffer()]`

### deriveStablecoinAddresses()

Convenience function that derives the config PDA for a given mint.

```typescript
function deriveStablecoinAddresses(
  programId: PublicKey,
  mint: PublicKey,
): { config: PublicKey; configBump: number; mint: PublicKey }
```

---

## Types

### StablecoinConfig

```typescript
interface StablecoinConfig {
  name: string;
  symbol: string;
  uri?: string;
  decimals: number;
  preset?: Presets;
  authority?: Signer;
  extensions: StablecoinExtensions;
}
```

### StablecoinExtensions

```typescript
interface StablecoinExtensions {
  permanentDelegate: boolean;
  transferHook: boolean;
  defaultAccountFrozen: boolean;
  confidentialTransfers: boolean;
}
```

### CreateStablecoinParams

```typescript
interface CreateStablecoinParams
  extends Partial<Omit<StablecoinConfig, "extensions">> {
  connection?: Connection;
  authority?: Signer;
  preset?: Presets;
  extensions?: Partial<StablecoinExtensions>;
}
```

### MintParams

```typescript
interface MintParams {
  recipient: PublicKey;  // recipient's token account
  amount: BN;
}
```

### BurnParams

```typescript
interface BurnParams {
  amount: BN;
}
```

### SeizeParams

```typescript
interface SeizeParams {
  from: PublicKey;  // source token account
  to: PublicKey;    // treasury token account
  amount: BN;
}
```

### StablecoinStatus

```typescript
interface StablecoinStatus {
  mint: PublicKey;
  authority: PublicKey;
  pendingAuthority: PublicKey | null;
  paused: boolean;
  complianceEnabled: boolean;
  totalMinted: BN;
  totalBurned: BN;
  supplyCap: BN;
  enableAllowlist: boolean;
}
```

### RoleInfo

```typescript
interface RoleInfo {
  config: PublicKey;
  holder: PublicKey;
  role: number;
}
```

### QuotaInfo

```typescript
interface QuotaInfo {
  config: PublicKey;
  minter: PublicKey;
  quotaLimit: BN;
  mintedAmount: BN;
}
```

### Presets Enum

```typescript
enum Presets {
  SSS_1 = "sss-1",
  SSS_2 = "sss-2",
  SSS_3 = "sss-3",
}
```

---

## Presets

Presets define the default extension configuration for each mode.

### SSS_1

```typescript
{
  permanentDelegate: false,
  transferHook: false,
  defaultAccountFrozen: false,
  confidentialTransfers: false,
}
```

### SSS_2

```typescript
{
  permanentDelegate: true,
  transferHook: true,
  defaultAccountFrozen: true,
  confidentialTransfers: false,
}
```

### SSS_3 (Allowlist Mode)

```typescript
{
  permanentDelegate: false,
  transferHook: false,
  defaultAccountFrozen: false,
  confidentialTransfers: true,
}
```

SSS-3 is initialized with `compliance_enabled: true` and `enable_allowlist: true` on-chain. Only addresses with an active `AllowlistEntry` PDA can hold or transfer tokens.

### buildPresetConfig()

Build a full config from partial parameters and a preset:

```typescript
function buildPresetConfig(params: CreateStablecoinParams): StablecoinConfig
```

Extension overrides merge on top of the preset defaults.

---

## CLI Reference

The CLI is invoked as `sss-token`. It reads configuration from `~/.sss-token.json` or command-line flags.

### Global Options

| Flag | Description |
|------|-------------|
| `--rpc-url <url>` | Solana RPC endpoint |
| `--keypair <path>` | Path to keypair file |
| `--program-id <id>` | sss-core program ID |
| `--output <format>` | Output format: `table`, `json`, `csv` |

### init

Initialize a new stablecoin.

```bash
sss-token init [options]
  --preset <preset>              Preset (sss-1, sss-2) [default: sss-1]
  --name <name>                  Token name [default: "My Stablecoin"]
  --symbol <symbol>              Token symbol [default: "MYST"]
  --uri <uri>                    Metadata URI [default: ""]
  --decimals <n>                 Decimals [default: 6]
  --permanent-delegate           Enable permanent delegate
  --transfer-hook                Enable transfer hook
  --default-account-frozen       Default freeze new accounts
  --dry-run                      Show config without deploying
  --write <path>                 Write config JSON to file
```

The mint address is automatically saved to the CLI config after initialization.

### mint

```bash
sss-token mint <recipient> <amount>
```

Mint tokens to a recipient address. Amount is in base units.

### burn

```bash
sss-token burn <amount>
```

Burn tokens from the caller's token account.

### freeze

```bash
sss-token freeze <token-account-address>
```

Freeze a token account.

### thaw

```bash
sss-token thaw <token-account-address>
```

Thaw a frozen token account.

### pause

```bash
sss-token pause
```

Pause the stablecoin (authority only).

### unpause

```bash
sss-token unpause
```

Unpause the stablecoin (authority only).

### status

```bash
sss-token status
```

Display full stablecoin status: authority, paused state, compliance, supply.

### supply

```bash
sss-token supply
```

Display supply information: totalMinted, totalBurned, netSupply.

### roles

Role management commands.

```bash
sss-token roles grant <role> <address>     # Grant a role
sss-token roles revoke <role> <address>    # Revoke a role
sss-token roles check <role> <address>     # Check if address has role
```

Role names: `admin`, `minter`, `pauser`, `freezer`, `blacklister`, `seizer` (or numeric 0-5).

### minters

Minter management (convenience wrappers for grant + set-quota).

```bash
sss-token minters add <address> --quota <amount>    # Grant role + set quota
sss-token minters remove <address>                  # Revoke minter role
sss-token minters quota <address>                   # Check quota usage
```

### blacklist (SSS-2)

Blacklist management.

```bash
sss-token blacklist add <address> [--reason <reason>]    # Add to blacklist
sss-token blacklist remove <address>                     # Remove from blacklist
sss-token blacklist check <address>                      # Check blacklist status
```

### seize (SSS-2)

Seize tokens from a blacklisted address.

```bash
sss-token seize <from-owner> --to <treasury-owner> --amount <amount>
```

### authority

Two-step authority transfer.

```bash
sss-token authority propose <new-authority>    # Step 1: propose
sss-token authority accept                     # Step 2: accept
sss-token authority cancel                     # Cancel pending transfer
```

### set-metadata

Update token metadata.

```bash
sss-token set-metadata <field> <value>
```

Fields: `name`, `symbol`, `uri`, or any custom key.

### holders

List token holders.

```bash
sss-token holders [--min-balance <amount>]
```

### audit-log

Show recent program transactions.

```bash
sss-token audit-log [--limit <n>]
```

### config

CLI configuration management.

```bash
sss-token config show                           # Show current config
sss-token config set <key> <value>              # Set a config value
sss-token config set mintAddress <address>      # Set the active mint
```
