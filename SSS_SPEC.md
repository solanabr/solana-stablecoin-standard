# Solana Stablecoin Standard (SSS) — Build Specification

> **Standard Name**: SSS — Solana Stablecoin Standard
> **Repository**: `github.com/solanabr/solana-stablecoin-standard`
> **Quality Reference**: Solana Vault Standard (`github.com/solanabr/solana-vault-standard`)
> **License**: MIT

---

## 1. Background and Purpose

Superteam Brazil is building open-source infrastructure for Solana. The Solana Vault Standard (SVS) shipped first. SSS is next — a modular SDK and on-chain program system for issuing stablecoins on Solana using Token-2022 extensions.

The GENIUS Act (signed into law July 2025) created federal requirements for stablecoin issuers: reserve backing, BSA/AML compliance, freeze/seize/block capabilities, redemption guarantees, and audit transparency. SSS-2 maps directly to these requirements on-chain. SSS-1 exists for simpler use cases (DAO treasuries, internal settlement tokens) where full regulatory compliance isn't needed.

Think of SSS as OpenZeppelin for Solana stablecoins. The SDK is the library. SSS-1 and SSS-2 are the opinionated presets (like ERC-20, ERC-721). SSS-3 is an experimental privacy tier.

### Regulatory context (GENIUS Act mapping)

| GENIUS Act Requirement | On-Chain Implementation |
|---|---|
| Block transactions from sanctioned addresses | Transfer Hook checks blacklist PDAs on every transfer |
| Freeze stablecoin accounts | Freeze Authority held by program PDA, exposed via `freeze_account` |
| Seize/burn tokens per lawful order | Permanent Delegate enables `seize` (force-transfer to treasury) |
| Pause all transfers in emergency | Global pause flag in Config PDA, enforced by Transfer Hook |
| BSA/AML sanctions screening | Blacklister role + compliance service integration point |
| Audit trail for all operations | Anchor events emitted on every state-changing instruction |
| Redemption at par | Minter/burner roles with quota management for mint/burn lifecycle |
| Reserve transparency | On-chain supply tracking + off-chain attestation integration point |

**References**:
- GENIUS Act overview: `https://en.wikipedia.org/wiki/GENIUS_Act`
- Legal analysis: `https://www.lw.com/en/insights/the-genius-act-of-2025-stablecoin-legislation-adopted-in-the-us`
- Compliance guide: `https://www.dotfile.com/blog-articles/genius-act-compliance-complete-guide-for-2026`

---

## 2. Architecture Overview

### 2.1 Three-Layer Model

```
┌─────────────────────────────────────────────────────┐
│  Layer 3 — Standard Presets                          │
│  SSS-1 (Minimal) │ SSS-2 (Compliant) │ SSS-3 (Private) │
├─────────────────────────────────────────────────────┤
│  Layer 2 — Modules                                   │
│  Compliance Module │ Privacy Module │ Oracle Module   │
├─────────────────────────────────────────────────────┤
│  Layer 1 — Base SDK                                  │
│  Token-2022 Mint │ Role Management │ CLI │ TS SDK    │
└─────────────────────────────────────────────────────┘
```

**Layer 1 (Base SDK)**: Token creation with mint/freeze authority + metadata. Issuers choose which extensions to enable. Role management program. CLI + TypeScript SDK.

**Layer 2 (Modules)**: Composable capabilities. Compliance module (transfer hook, blacklist PDAs, permanent delegate). Privacy module (confidential transfers, allowlists). Oracle module (Switchboard feeds for non-USD pegs). Each module is independently testable and optional.

**Layer 3 (Standard Presets)**: Opinionated combinations of Layer 1 + Layer 2. These are the standards — what gets documented, recommended, and adopted.

### 2.2 Program Architecture (Two Programs)

The system deploys **two Anchor programs**:

1. **`stablecoin` program** — All admin/management instructions (initialize, mint, burn, freeze, thaw, pause, unpause, roles, blacklist, seize, configure)
2. **`transfer-hook` program** — Separate program that Token-2022 CPIs into on every transfer to enforce blacklist + pause checks

They must be separate programs because Token-2022 invokes the transfer hook program directly via CPI — it cannot be a function inside the stablecoin program.

### 2.3 Critical Constraint: Transfer Hook + Confidential Transfers Incompatibility

**This is the single most important architectural constraint.**

When Confidential Transfers encrypt amounts via ElGamal, the Transfer Hook CPI cannot read encrypted data — it breaks. These two extensions are fundamentally incompatible on the same mint for the same transfer.

**Consequence**: SSS-1 and SSS-2 use Transfer Hook + Permanent Delegate. SSS-3 uses Confidential Transfers (manual approval mode) WITHOUT Transfer Hook. The `Preset` enum at initialization determines which extension set is configured. This is an immutable choice — extensions cannot be added post-creation.

**References**:
- Token-2022 spec: `https://rareskills.io/post/token-2022`
- Token Extensions overview: `https://solana.com/solutions/token-extensions`
- Confidential Balances: `https://www.solana-program.com/docs/confidential-balances`

---

## 3. On-Chain Programs

### 3.1 State Accounts

All PDAs are derived from the stablecoin program ID unless noted otherwise.

#### StablecoinConfig (Global Config PDA)
```
Seeds: ["config", mint_pubkey]
```
```rust
#[account]
pub struct StablecoinConfig {
    pub mint: Pubkey,                    // The Token-2022 mint
    pub preset: StablecoinPreset,        // SSS1, SSS2, or SSS3
    pub name: String,                    // Token name
    pub symbol: String,                  // Token symbol
    pub uri: String,                     // Metadata URI
    pub decimals: u8,                    // Typically 6

    // Authorities
    pub owner: Pubkey,                   // Master authority (set all roles, transfer ownership)
    pub pending_owner: Option<Pubkey>,   // For two-step ownership transfer
    pub master_minter: Pubkey,           // Manages minters and quotas
    pub pauser: Pubkey,                  // Can pause/unpause
    pub blacklister: Pubkey,             // Can blacklist/unblacklist (SSS-2+)

    // State
    pub is_paused: bool,
    pub total_minted: u64,               // Cumulative mint tracking
    pub total_burned: u64,               // Cumulative burn tracking

    // Feature flags (set at init, immutable)
    pub enable_transfer_hook: bool,
    pub enable_permanent_delegate: bool,
    pub enable_confidential_transfers: bool,
    pub default_account_frozen: bool,

    // SSS-3 specific
    pub auditor_elgamal_pubkey: Option<[u8; 32]>,

    pub bump: u8,
}
```

#### StablecoinPreset Enum
```rust
#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq)]
pub enum StablecoinPreset {
    SSS1,  // Minimal: mint + freeze + metadata
    SSS2,  // Compliant: SSS1 + permanent delegate + transfer hook + blacklist
    SSS3,  // Private: mint + freeze + metadata + confidential transfers (manual mode)
    Custom, // User-provided feature flags
}
```

Preset → feature flag mapping:

| Flag | SSS-1 | SSS-2 | SSS-3 |
|---|---|---|---|
| `enable_transfer_hook` | false | **true** | false |
| `enable_permanent_delegate` | false | **true** | **true** |
| `enable_confidential_transfers` | false | false | **true** |
| `default_account_frozen` | false | false | false |

#### MinterAllowance PDA
```
Seeds: ["minter", mint_pubkey, minter_pubkey]
```
```rust
#[account]
pub struct MinterAllowance {
    pub mint: Pubkey,
    pub minter: Pubkey,
    pub allowance: u64,          // Remaining mint quota
    pub total_minted: u64,       // Lifetime tracking for this minter
    pub is_active: bool,
    pub bump: u8,
}
```

#### BlacklistEntry PDA (SSS-2 only)
```
Seeds: ["blacklist", mint_pubkey, wallet_pubkey]
```
```rust
#[account]
pub struct BlacklistEntry {
    pub mint: Pubkey,
    pub wallet: Pubkey,
    pub blacklisted_at: i64,     // Unix timestamp
    pub reason: String,          // Max 128 chars — "OFAC match", "Court order #1234"
    pub blacklisted_by: Pubkey,  // The blacklister authority
    pub bump: u8,
}
```

**Design choice**: Per-address PDAs (not a single list account) — scales to millions of addresses, account existence = blacklisted, closing PDA = unblacklisted.

#### RoleAssignment PDA (optional, for granular tracking)
```
Seeds: ["role", mint_pubkey, role_type_bytes, assignee_pubkey]
```
```rust
#[account]
pub struct RoleAssignment {
    pub mint: Pubkey,
    pub role: Role,
    pub assignee: Pubkey,
    pub assigned_by: Pubkey,
    pub assigned_at: i64,
    pub bump: u8,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq)]
pub enum Role {
    Owner,
    MasterMinter,
    Minter,
    Pauser,
    Blacklister,
}
```

### 3.2 Stablecoin Program Instructions

#### `initialize`
Creates the Token-2022 mint with extensions based on preset. This is the most complex instruction — extension init order is critical.

**Extension initialization sequence** (MUST happen before `initializeMint`):
1. `createAccount` with pre-calculated space via `getMintLen([...extensions])`
2. `initializePermanentDelegate` (if SSS-2 or SSS-3)
3. `initializeTransferHook` with hook program ID (if SSS-2)
4. `initializeConfidentialTransferMint` with `auto_approve_new_accounts: false` (if SSS-3)
5. `initializeMetadataPointer` (points to mint itself)
6. `initializeMint` with decimals, mint authority = program PDA, freeze authority = program PDA
7. `initializeMetadata` (name, symbol, uri)
8. Create `StablecoinConfig` PDA

**References**:
- Extension init order: `https://solana.com/developers/guides/token-extensions/permanent-delegate`
- Transfer Hook setup: `https://solana.com/developers/guides/token-extensions/transfer-hook`
- Confidential Transfers: `https://www.solana-program.com/docs/confidential-balances`

```rust
pub fn initialize(
    ctx: Context<Initialize>,
    params: InitializeParams,
) -> Result<()>

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct InitializeParams {
    pub preset: StablecoinPreset,
    pub name: String,
    pub symbol: String,
    pub uri: String,
    pub decimals: u8,
    // Only used if preset == Custom
    pub enable_permanent_delegate: Option<bool>,
    pub enable_transfer_hook: Option<bool>,
    pub enable_confidential_transfers: Option<bool>,
    pub default_account_frozen: Option<bool>,
    // Authority assignments
    pub master_minter: Pubkey,
    pub pauser: Pubkey,
    pub blacklister: Option<Pubkey>,  // Required for SSS-2, optional otherwise
    // SSS-3
    pub auditor_elgamal_pubkey: Option<[u8; 32]>,
}
```

#### `mint`
```rust
pub fn mint(ctx: Context<MintTokens>, amount: u64) -> Result<()>
```
**Checks**: not paused, signer is active minter, `amount <= minter.allowance`, recipient not blacklisted (if SSS-2). Decrements `minter.allowance`, increments `minter.total_minted` and `config.total_minted`. CPIs to Token-2022 `mint_to`.

#### `burn`
```rust
pub fn burn(ctx: Context<BurnTokens>, amount: u64) -> Result<()>
```
**Checks**: not paused, signer is authorized minter/burner. Burns from signer's token account. Increments `config.total_burned`.

#### `freeze_account` / `thaw_account`
```rust
pub fn freeze_account(ctx: Context<FreezeAccount>) -> Result<()>
pub fn thaw_account(ctx: Context<ThawAccount>) -> Result<()>
```
**Checks**: signer is owner or blacklister. CPIs to Token-2022 using program PDA as freeze authority.

#### `pause` / `unpause`
```rust
pub fn pause(ctx: Context<Pause>) -> Result<()>
pub fn unpause(ctx: Context<Unpause>) -> Result<()>
```
**Checks**: signer is pauser. Sets `config.is_paused`. Transfer Hook reads this flag on every transfer.

#### `blacklist_add` / `blacklist_remove` (SSS-2 only)
```rust
pub fn blacklist_add(ctx: Context<BlacklistAdd>, reason: String) -> Result<()>
pub fn blacklist_remove(ctx: Context<BlacklistRemove>) -> Result<()>
```
**Checks**: config must have `enable_transfer_hook == true` (SSS-2 feature gate), signer is blacklister. Creates/closes `BlacklistEntry` PDA. Also freezes the account on blacklist add (belt + suspenders — hook blocks transfers AND account is frozen).

**Feature gating**: If called on an SSS-1 mint, return `ErrorCode::FeatureNotEnabled`.

#### `seize` (SSS-2 only)
```rust
pub fn seize(ctx: Context<Seize>, amount: u64) -> Result<()>
```
**Checks**: config must have `enable_permanent_delegate == true`, signer is owner, target is blacklisted. Uses Permanent Delegate authority (the program PDA) to force-transfer tokens from blacklisted account to treasury. Emits `SeizeEvent`.

**Reference**: `https://solana.com/developers/guides/token-extensions/permanent-delegate`

#### `assign_role` / `revoke_role`
```rust
pub fn assign_role(ctx: Context<AssignRole>, role: Role, assignee: Pubkey) -> Result<()>
pub fn revoke_role(ctx: Context<RevokeRole>, role: Role, assignee: Pubkey) -> Result<()>
```
**Checks**: signer is owner (for all roles) or master_minter (for minters only). Creates/closes `RoleAssignment` PDA. For minters, also creates/manages `MinterAllowance` PDA.

#### `update_minter_allowance`
```rust
pub fn update_minter_allowance(ctx: Context<UpdateMinterAllowance>, new_allowance: u64) -> Result<()>
```
**Checks**: signer is master_minter. Updates `minter.allowance`.

#### `transfer_ownership`
```rust
pub fn transfer_ownership(ctx: Context<TransferOwnership>, new_owner: Pubkey) -> Result<()>
pub fn accept_ownership(ctx: Context<AcceptOwnership>) -> Result<()>
```
Two-step transfer: owner sets `pending_owner`, then `pending_owner` calls `accept_ownership`.

#### `approve_confidential_account` (SSS-3 only)
```rust
pub fn approve_confidential_account(ctx: Context<ApproveConfidential>) -> Result<()>
```
**Checks**: config must have `enable_confidential_transfers == true`, signer is owner or blacklister. CPIs to Token-2022 `confidential_transfer_approve_account`. This is the allowlist gate — only KYC-approved addresses can transact confidentially.

### 3.3 Events

Every state-changing instruction emits an Anchor event. The backend indexer and audit trail depend on these.

```rust
#[event]
pub struct InitializeEvent {
    pub mint: Pubkey,
    pub preset: StablecoinPreset,
    pub owner: Pubkey,
    pub timestamp: i64,
}

#[event]
pub struct MintEvent {
    pub mint: Pubkey,
    pub minter: Pubkey,
    pub recipient: Pubkey,
    pub amount: u64,
    pub remaining_allowance: u64,
    pub timestamp: i64,
}

#[event]
pub struct BurnEvent {
    pub mint: Pubkey,
    pub burner: Pubkey,
    pub amount: u64,
    pub timestamp: i64,
}

#[event]
pub struct BlacklistEvent {
    pub mint: Pubkey,
    pub wallet: Pubkey,
    pub action: BlacklistAction, // Added | Removed
    pub reason: String,
    pub by: Pubkey,
    pub timestamp: i64,
}

#[event]
pub struct SeizeEvent {
    pub mint: Pubkey,
    pub from: Pubkey,
    pub to: Pubkey,  // treasury
    pub amount: u64,
    pub by: Pubkey,
    pub timestamp: i64,
}

#[event]
pub struct PauseEvent {
    pub mint: Pubkey,
    pub is_paused: bool,
    pub by: Pubkey,
    pub timestamp: i64,
}

#[event]
pub struct RoleEvent {
    pub mint: Pubkey,
    pub role: Role,
    pub assignee: Pubkey,
    pub action: RoleAction, // Assigned | Revoked
    pub by: Pubkey,
    pub timestamp: i64,
}

#[event]
pub struct FreezeEvent {
    pub mint: Pubkey,
    pub account: Pubkey,
    pub action: FreezeAction, // Frozen | Thawed
    pub by: Pubkey,
    pub timestamp: i64,
}
```

### 3.4 Transfer Hook Program

This is a **separate Anchor program** deployed at its own program ID.

**References**:
- Transfer Hook guide: `https://solana.com/developers/guides/token-extensions/transfer-hook`
- QuickNode deep dive: `https://www.quicknode.com/guides/solana-development/spl-tokens/token-2022/transfer-hooks`

#### How Transfer Hooks Work

Token-2022 calls the hook program via CPI on every `transfer_checked` for mints that have the Transfer Hook extension. The hook program **must** expose:
1. `initialize_extra_account_meta_list` — registers additional accounts the hook needs (called once after mint creation)
2. `transfer_hook` (the execute handler) — the logic that runs on every transfer

The hook receives these accounts from Token-2022 automatically:
- `[0]` source token account
- `[1]` mint
- `[2]` destination token account
- `[3]` source authority/owner
- `[4]` ExtraAccountMetaList PDA
- `[5+]` any extra accounts defined in the meta list

#### ExtraAccountMeta Configuration

The hook needs three extra accounts to check blacklist + pause:

```rust
pub fn initialize_extra_account_meta_list(ctx: Context<InitializeExtraAccountMetaList>) -> Result<()> {
    let extra_account_metas = vec![
        // [5] Config PDA — to check is_paused
        ExtraAccountMeta::new_with_seeds(
            &[
                Seed::Literal { bytes: b"config".to_vec() },
                Seed::AccountKey { index: 1 }, // mint
            ],
            false,  // is_signer
            false,  // is_writable
        )?,
        // [6] Source blacklist PDA — may or may not exist
        ExtraAccountMeta::new_with_seeds(
            &[
                Seed::Literal { bytes: b"blacklist".to_vec() },
                Seed::AccountKey { index: 1 }, // mint
                Seed::AccountKey { index: 3 }, // source owner
            ],
            false,
            false,
        )?,
        // [7] Destination blacklist PDA — may or may not exist
        ExtraAccountMeta::new_with_seeds(
            &[
                Seed::Literal { bytes: b"blacklist".to_vec() },
                Seed::AccountKey { index: 1 }, // mint
                // Destination owner requires resolving from token account — see note below
            ],
            false,
            false,
        )?,
    ];

    ExtraAccountMetaList::init::<ExecuteInstruction>(
        &mut ctx.accounts.extra_account_meta_list.try_borrow_mut_data()?,
        &extra_account_metas,
    )?;
    Ok(())
}
```

> **Implementation note**: Resolving the destination *owner* from the destination *token account* (index 2) for the blacklist PDA seed is non-trivial. The ExtraAccountMeta system supports `Seed::AccountData { account_index, data_index, length }` to extract the owner field from the token account data at offset 32 (owner field in Token account layout). Alternatively, use a simpler approach: pass the destination owner as a separate extra account and validate it matches.

#### Transfer Hook Execute Logic

```rust
pub fn transfer_hook(ctx: Context<TransferHook>, amount: u64) -> Result<()> {
    // SECURITY: Verify this is called by Token-2022 during a real transfer
    spl_transfer_hook_interface::onchain::assert_is_transferring()?;

    // Check global pause
    let config = &ctx.accounts.config;
    require!(!config.is_paused, SSSError::TokenPaused);

    // Check source blacklist — if PDA exists with data, address is blacklisted
    if !ctx.accounts.source_blacklist.data_is_empty() {
        return err!(SSSError::AddressBlacklisted);
    }

    // Check destination blacklist
    if !ctx.accounts.destination_blacklist.data_is_empty() {
        return err!(SSSError::AddressBlacklisted);
    }

    Ok(())
}
```

**Critical**: Use `#[interface(spl_transfer_hook_interface::execute)]` attribute for Anchor 0.31+ to handle discriminator bridging between SPL interface and Anchor. For older versions, implement a `fallback` function.

**Critical**: All accounts passed to the hook from Token-2022 are **read-only** — the hook cannot modify any state. It can only allow or reject the transfer.

#### Client-Side Transfer Resolution

When a client builds a transfer transaction, it must include the extra accounts. Use:
```typescript
import { createTransferCheckedWithTransferHookInstruction } from "@solana/spl-token";
```
This automatically resolves the ExtraAccountMetaList and appends the required accounts.

### 3.5 Error Codes

```rust
#[error_code]
pub enum SSSError {
    #[msg("Token is paused")]
    TokenPaused,
    #[msg("Address is blacklisted")]
    AddressBlacklisted,
    #[msg("Feature not enabled for this preset")]
    FeatureNotEnabled,
    #[msg("Unauthorized — insufficient role")]
    Unauthorized,
    #[msg("Minter allowance exceeded")]
    AllowanceExceeded,
    #[msg("Minter is not active")]
    MinterNotActive,
    #[msg("Invalid preset configuration")]
    InvalidPreset,
    #[msg("Account is not blacklisted (cannot seize)")]
    NotBlacklisted,
    #[msg("Pending owner mismatch")]
    PendingOwnerMismatch,
    #[msg("Reason string too long (max 128 chars)")]
    ReasonTooLong,
    #[msg("Cannot blacklist the treasury")]
    CannotBlacklistTreasury,
}
```

---

## 4. TypeScript SDK (`@stbr/sss-sdk`)

### 4.1 Structure

```
clients/js/
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts                 // Public API exports
│   ├── generated/               // Codama-generated from Anchor IDL
│   │   ├── instructions/        // Typed instruction builders
│   │   ├── accounts/            // Account deserializers
│   │   ├── types/               // Enum/struct types
│   │   └── errors/              // Error code mapping
│   ├── presets.ts               // SSS-1, SSS-2, SSS-3 configs
│   ├── pda.ts                   // All PDA derivation helpers
│   ├── actions/                 // High-level action functions
│   │   ├── createStablecoin.ts  // Full mint creation flow
│   │   ├── mint.ts
│   │   ├── burn.ts
│   │   ├── blacklist.ts
│   │   ├── seize.ts
│   │   ├── freeze.ts
│   │   ├── pause.ts
│   │   ├── roles.ts
│   │   └── transfer.ts          // Transfer with hook resolution
│   └── types.ts                 // SDK-level types
└── tests/
```

### 4.2 SDK Generation

Use **Codama** to generate typed clients from the Anchor IDL:

```bash
# After `anchor build`, generate the IDL
anchor idl parse -f programs/stablecoin/src/lib.rs -o target/idl/stablecoin.json

# Use Codama to generate TypeScript SDK
npx @codama/cli generate \
  --idl target/idl/stablecoin.json \
  --output clients/js/src/generated/
```

**Reference**: `https://github.com/codama-idl/codama`

### 4.3 High-Level API

```typescript
import { SolanaStablecoin, Presets } from "@stbr/sss-sdk";

// === Preset initialization ===
const stablecoin = await SolanaStablecoin.create(connection, {
  preset: Presets.SSS_2,
  name: "My Stablecoin",
  symbol: "MYUSD",
  decimals: 6,
  authority: ownerKeypair,
  masterMinter: masterMinterPubkey,
  pauser: pauserPubkey,
  blacklister: blacklisterPubkey,
});
// Returns: { mint, configPda, transferHookPda?, txSignature }

// === Custom initialization ===
const custom = await SolanaStablecoin.create(connection, {
  preset: Presets.Custom,
  name: "Custom Stable",
  symbol: "CUSD",
  decimals: 6,
  extensions: {
    permanentDelegate: true,
    transferHook: false,
    confidentialTransfers: false,
  },
  authority: ownerKeypair,
  masterMinter: masterMinterPubkey,
  pauser: pauserPubkey,
});

// === Load existing stablecoin ===
const existing = await SolanaStablecoin.load(connection, mintPubkey);

// === Operations ===
await stablecoin.mint({ recipient, amount: 1_000_000n, minter: minterKeypair });
await stablecoin.burn({ amount: 500_000n, burner: minterKeypair });
await stablecoin.freeze(targetAddress);
await stablecoin.thaw(targetAddress);
await stablecoin.pause(pauserKeypair);
await stablecoin.unpause(pauserKeypair);

// === SSS-2 Compliance ===
await stablecoin.compliance.blacklistAdd(address, "OFAC match", blacklisterKeypair);
await stablecoin.compliance.blacklistRemove(address, blacklisterKeypair);
await stablecoin.compliance.seize(frozenAccount, treasuryAddress, ownerKeypair);
const isBlacklisted = await stablecoin.compliance.isBlacklisted(address);

// === Queries ===
const supply = await stablecoin.getTotalSupply();
const config = await stablecoin.getConfig();
const minters = await stablecoin.getMinters();
const blacklist = await stablecoin.getBlacklistedAddresses();

// === Transfer (with automatic hook resolution for SSS-2) ===
await stablecoin.transfer({
  from: senderKeypair,
  to: recipientPubkey,
  amount: 100_000n,
});
```

### 4.4 PDA Helpers

```typescript
export function deriveConfigPda(mint: PublicKey, programId: PublicKey): PublicKey;
export function deriveMinterPda(mint: PublicKey, minter: PublicKey, programId: PublicKey): PublicKey;
export function deriveBlacklistPda(mint: PublicKey, wallet: PublicKey, programId: PublicKey): PublicKey;
export function deriveRolePda(mint: PublicKey, role: Role, assignee: PublicKey, programId: PublicKey): PublicKey;
export function deriveExtraAccountMetaListPda(mint: PublicKey, hookProgramId: PublicKey): PublicKey;
```

---

## 5. Admin CLI (`sss-token`)

### 5.1 Technology

Built with **Commander.js** in TypeScript. Consumes the SDK directly — the CLI is a thin interactive wrapper over SDK actions.

### 5.2 Commands

```bash
# ========== Initialization ==========
sss-token init --preset sss-1 --name "MyUSD" --symbol "MYUSD" --decimals 6
sss-token init --preset sss-2 --name "RegUSD" --symbol "RUSD" --decimals 6 \
  --master-minter <pubkey> --pauser <pubkey> --blacklister <pubkey>
sss-token init --preset sss-3 --name "PrivUSD" --symbol "PUSD" --decimals 6 \
  --auditor-elgamal <hex>
sss-token init --custom config.toml

# ========== Token Operations ==========
sss-token mint <recipient> <amount> --mint <mint-address>
sss-token burn <amount> --mint <mint-address>
sss-token transfer <recipient> <amount> --mint <mint-address>

# ========== Account Management ==========
sss-token freeze <address> --mint <mint-address>
sss-token thaw <address> --mint <mint-address>
sss-token pause --mint <mint-address>
sss-token unpause --mint <mint-address>

# ========== SSS-2 Compliance ==========
sss-token blacklist add <address> --reason "OFAC match" --mint <mint-address>
sss-token blacklist remove <address> --mint <mint-address>
sss-token blacklist list --mint <mint-address>
sss-token seize <address> --to <treasury> --mint <mint-address>

# ========== Role Management ==========
sss-token roles list --mint <mint-address>
sss-token minters list --mint <mint-address>
sss-token minters add <address> --allowance <amount> --mint <mint-address>
sss-token minters remove <address> --mint <mint-address>
sss-token minters update-allowance <address> --allowance <amount> --mint <mint-address>

# ========== Info & Audit ==========
sss-token info --mint <mint-address>
sss-token supply --mint <mint-address>
sss-token holders --mint <mint-address> [--min-balance <amount>]
sss-token audit-log --mint <mint-address> [--action <type>] [--from <date>] [--to <date>]

# ========== Ownership ==========
sss-token transfer-ownership <new-owner> --mint <mint-address>
sss-token accept-ownership --mint <mint-address>

# ========== Global Options ==========
# --url <rpc>           Solana RPC URL or moniker (mainnet, devnet, localnet)
# --keypair <path>      Wallet keypair file path
# --simulate            Dry run — simulates without sending
# --print-only          Output base64 transaction (for multisig/governance)
# --commitment <level>  confirmed | finalized
# --output <format>     text | json
```

### 5.3 CLI UX Requirements

- Confirmation prompts before destructive operations (seize, blacklist, pause, transfer-ownership)
- Color-coded output via chalk (green for success, red for errors, yellow for warnings)
- Explorer links after every transaction (Solscan/Solana Explorer)
- `--simulate` flag for dry runs
- `--print-only` for multisig workflows (outputs base64 serialized transaction)
- `--output json` for scripting/automation
- TOML/JSON config file support for `init --custom`

---

## 6. Backend Services

### 6.1 Architecture

```
Helius Webhook → Express.js API → BullMQ (Redis) → Worker → PostgreSQL
                                                          → Webhook Dispatcher
```

All containerized via Docker Compose. Single `docker compose up` starts everything.

### 6.2 Components

#### Event Indexer (Express.js)
- Receives raw transaction data via Helius webhook endpoint
- Parses Anchor events using `BorshCoder` + `EventParser` with the program IDL
- Enqueues parsed events into BullMQ with exponential backoff retry (5 attempts, 2s base)
- Health check endpoint at `/health`
- Structured JSON logging (pino)

**Reference for parsing**: `https://dev.to/teepy/parsing-solana-program-transactions-using-typescript-part12-1i6d`

#### Event Worker
- Processes events from BullMQ queue
- Writes to PostgreSQL tables: `events`, `blacklist_status`, `minter_activity`, `supply_snapshots`
- Dispatches webhook notifications for subscribed events

#### Webhook Dispatcher (SSS-2)
- Configurable event subscriptions (e.g., notify on every blacklist action)
- HTTP POST to registered URLs with retry logic
- Payload: event type, transaction signature, parsed event data, timestamp

#### PostgreSQL Schema
```sql
CREATE TABLE events (
    id BIGSERIAL PRIMARY KEY,
    mint TEXT NOT NULL,
    event_type TEXT NOT NULL,
    transaction_signature TEXT UNIQUE NOT NULL,
    slot BIGINT NOT NULL,
    data JSONB NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_events_mint_type ON events(mint, event_type);
CREATE INDEX idx_events_slot ON events(slot);

CREATE TABLE blacklist_status (
    mint TEXT NOT NULL,
    wallet TEXT NOT NULL,
    is_blacklisted BOOLEAN NOT NULL,
    reason TEXT,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (mint, wallet)
);

CREATE TABLE minter_activity (
    mint TEXT NOT NULL,
    minter TEXT NOT NULL,
    current_allowance BIGINT NOT NULL,
    total_minted BIGINT NOT NULL,
    is_active BOOLEAN NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (mint, minter)
);

CREATE TABLE webhook_subscriptions (
    id BIGSERIAL PRIMARY KEY,
    mint TEXT NOT NULL,
    event_types TEXT[] NOT NULL,
    url TEXT NOT NULL,
    secret TEXT,
    is_active BOOLEAN DEFAULT TRUE
);
```

### 6.3 Docker Compose

```yaml
services:
  indexer:
    build: .
    ports: ["3000:3000"]
    environment:
      - DATABASE_URL=postgres://sss:sss@postgres:5432/sss
      - REDIS_URL=redis://redis:6379
      - SOLANA_RPC_URL=${SOLANA_RPC_URL}
      - PROGRAM_ID=${PROGRAM_ID}
    depends_on: [postgres, redis]
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/health"]
      interval: 30s
      retries: 3

  postgres:
    image: postgres:16-alpine
    volumes: ["pgdata:/var/lib/postgresql/data", "./init.sql:/docker-entrypoint-initdb.d/init.sql"]
    environment:
      POSTGRES_USER: sss
      POSTGRES_PASSWORD: sss
      POSTGRES_DB: sss

  redis:
    image: redis:7-alpine

volumes:
  pgdata:
```

---

## 7. Bonus: Oracle Module (Switchboard)

Switchboard On-Demand is preferred over Pyth for non-USD pegs because it's permissionless — anyone can create custom feeds from any API endpoint.

**Reference**: `https://docs.switchboard.xyz/`

### 7.1 On-Chain Oracle Adapter Program

A small separate Anchor program that reads Switchboard feeds and exposes price data for mint/redeem pricing.

```rust
#[account]
pub struct PriceFeedConfig {
    pub stablecoin_mint: Pubkey,
    pub switchboard_feed: Pubkey,
    pub base_currency: String,       // "EUR", "BRL", "CPI"
    pub max_stale_slots: u64,        // e.g., 100 slots (~40 seconds)
    pub min_samples: u8,             // e.g., 3
    pub authority: Pubkey,
    pub bump: u8,
}
```

Instructions:
- `initialize_feed` — register a Switchboard feed for a stablecoin
- `get_price` — reads feed, validates staleness + sample count, returns price
- `update_feed_config` — change staleness params

Use `switchboard-on-demand` crate v0.5.3+ with `PullFeedAccountData::parse()` for on-chain feed reading.

### 7.2 Off-Chain Feed Creation Script

TypeScript script to create Switchboard feeds for EUR/USD and BRL/USD:

```typescript
// Uses Switchboard SDK to define jobs:
// Job 1: httpTask (exchangerate-api.com) → jsonParseTask
// Job 2: httpTask (floatrates.com) → jsonParseTask
// Job 3: httpTask (fixer.io) → jsonParseTask
// Aggregation: median of 3 sources
```

---

## 8. Bonus: Interactive TUI (Ratatui)

Terminal UI for real-time monitoring and operations.

**Reference**: `https://ratatui.rs/`

### 8.1 Technology

Rust binary using **Ratatui** + **Crossterm** backend + **Clap** for initial CLI args.

### 8.2 Layout

```
┌─────────────────── SSS Admin TUI ───────────────────┐
│ Token: MYUSD (SSS-2)     Supply: 1,000,000.00       │
│ Status: ACTIVE            Blacklisted: 3             │
│ Minters: 2 active         Owner: 7xK2...            │
├─────────────────────────────────────────────────────┤
│ Recent Events                                        │
│ [12:34:05] MINT    +10,000 MYUSD → 3nF4...          │
│ [12:33:12] BLACKLIST ADD   9kQ7... (OFAC match)     │
│ [12:30:44] TRANSFER 500 MYUSD 8jR2... → 4mL9...    │
│ [12:28:01] ROLE    Minter added: 5pN3...            │
├─────────────────────────────────────────────────────┤
│ [m]int [b]lacklist [p]ause [r]oles [s]eize [q]uit   │
└─────────────────────────────────────────────────────┘
```

---

## 9. Bonus: Frontend Dashboard (Next.js)

### 9.1 Technology

Next.js 15, React 19, `@solana/wallet-adapter-react`, Tailwind CSS. Reads state via the TypeScript SDK.

### 9.2 Pages

- **Dashboard**: Supply stats, role assignments, pause status, recent events feed
- **Mint/Burn**: Form with minter wallet connection, amount input, recipient field
- **Blacklist**: Add/remove interface, searchable list with reason + timestamp
- **Roles**: Visual role assignment matrix, assign/revoke with confirmation
- **Config**: Feature flags display, authorities, preset info
- **Audit Log**: Filterable event history with transaction links

---

## 10. Testing Strategy

### 10.1 Unit Tests (Anchor)

Every instruction gets positive and negative test cases:

```
initialize/
  ✓ creates SSS-1 mint with correct extensions
  ✓ creates SSS-2 mint with transfer hook + permanent delegate
  ✓ creates SSS-3 mint with confidential transfers
  ✓ fails without required authorities for SSS-2
mint/
  ✓ mints within allowance
  ✓ fails when paused
  ✓ fails when minter inactive
  ✓ fails when allowance exceeded
  ✓ decrements allowance correctly
blacklist/
  ✓ adds address to blacklist
  ✓ removes address from blacklist
  ✓ fails on SSS-1 (feature not enabled)
  ✓ fails with wrong authority
transfer_hook/
  ✓ allows transfer when neither party blacklisted
  ✓ blocks transfer when source blacklisted
  ✓ blocks transfer when destination blacklisted
  ✓ blocks transfer when paused
  ✓ rejects direct invocation (assert_is_transferring)
seize/
  ✓ seizes tokens from blacklisted account
  ✓ fails on non-blacklisted account
  ✓ fails on SSS-1 (feature not enabled)
roles/
  ✓ owner can assign any role
  ✓ master_minter can add minters
  ✓ minter cannot assign roles
  ✓ two-step ownership transfer works
```

### 10.2 Integration Tests (Per Preset)

**SSS-1 lifecycle**: init → mint → transfer → freeze → thaw → burn
**SSS-2 lifecycle**: init → assign roles → mint → transfer → blacklist → verify blocked → seize → pause → verify all blocked → unpause → burn
**SSS-3 lifecycle**: init → approve confidential account → configure account → deposit → confidential transfer → withdraw

### 10.3 Fuzz Tests (Trident)

**Reference**: `https://crates.io/crates/trident-fuzz`

```bash
trident init   # Generates trident-tests/ directory
trident fuzz run-hfuzz  # Run honggfuzz-based fuzzing
```

Fuzz scenarios:
- Random instruction sequences with random parameters
- Arithmetic overflow in allowance tracking
- Unauthorized role escalation attempts
- Blacklist bypass via account recreation
- Concurrent minting stress test

### 10.4 Devnet Deployment Proof

Required for submission:
- Deploy both programs to devnet
- Record program IDs
- Execute example operations (init, mint, transfer, blacklist, seize)
- Collect transaction signatures as proof
- Document in `DEPLOYMENT.md` with Solscan links

---

## 11. Repository Structure (Complete)

```
solana-stablecoin-standard/
├── Cargo.toml                          # Workspace: [programs/*, clients/rust, modules/oracle/*]
├── package.json                        # pnpm workspace root
├── pnpm-workspace.yaml                 # packages: [clients/js, clients/cli, modules/backend, app]
├── Anchor.toml
├── Trident.toml
├── README.md
├── docs/
│   ├── ARCHITECTURE.md
│   ├── SSS-1.md
│   ├── SSS-2.md
│   ├── SSS-3.md
│   ├── SDK.md
│   ├── OPERATIONS.md
│   ├── COMPLIANCE.md
│   ├── API.md
│   └── DEPLOYMENT.md
├── programs/
│   ├── stablecoin/
│   │   ├── Cargo.toml
│   │   └── src/
│   │       ├── lib.rs
│   │       ├── state/
│   │       │   ├── mod.rs
│   │       │   ├── config.rs
│   │       │   ├── role.rs
│   │       │   ├── minter.rs
│   │       │   └── blacklist.rs
│   │       ├── instructions/
│   │       │   ├── mod.rs
│   │       │   ├── initialize.rs
│   │       │   ├── mint.rs
│   │       │   ├── burn.rs
│   │       │   ├── pause.rs
│   │       │   ├── blacklist.rs
│   │       │   ├── freeze.rs
│   │       │   ├── roles.rs
│   │       │   ├── configure.rs
│   │       │   └── seize.rs
│   │       ├── errors.rs
│   │       └── events.rs
│   └── transfer-hook/
│       ├── Cargo.toml
│       └── src/
│           ├── lib.rs
│           └── state.rs
├── clients/
│   ├── js/                             # TypeScript SDK
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── src/
│   │   │   ├── index.ts
│   │   │   ├── generated/
│   │   │   ├── presets.ts
│   │   │   ├── pda.ts
│   │   │   ├── actions/
│   │   │   └── types.ts
│   │   └── tests/
│   ├── cli/                            # Commander.js CLI
│   │   ├── package.json
│   │   └── src/
│   │       ├── index.ts
│   │       ├── commands/
│   │       └── utils/
│   └── rust/                           # Rust CLI + TUI
│       ├── Cargo.toml
│       └── src/
│           ├── main.rs
│           ├── tui/
│           └── commands/
├── modules/
│   ├── oracle/
│   │   ├── programs/oracle-adapter/
│   │   │   ├── Cargo.toml
│   │   │   └── src/lib.rs
│   │   └── scripts/
│   │       └── create-feeds.ts
│   └── backend/
│       ├── Dockerfile
│       ├── docker-compose.yml
│       ├── package.json
│       ├── init.sql
│       └── src/
│           ├── indexer.ts
│           ├── worker.ts
│           ├── webhook.ts
│           ├── db.ts
│           └── queue.ts
├── app/                                # Next.js frontend
│   ├── package.json
│   └── src/
│       ├── app/
│       ├── components/
│       └── lib/
├── tests/
│   ├── stablecoin.test.ts              # Anchor integration tests
│   ├── transfer-hook.test.ts
│   └── sdk.test.ts
└── trident-tests/
    └── fuzz_tests/
```

---

## 12. Recommended Build Order

Build in this order to maximize completeness at any stopping point:

1. **Stablecoin program state + initialize instruction** — Get a Token-2022 mint created with correct extensions for each preset
2. **Core instructions** (mint, burn, freeze, thaw, pause, roles) — Functional SSS-1
3. **Transfer Hook program** — Blacklist enforcement on every transfer
4. **SSS-2 instructions** (blacklist, seize) — Functional SSS-2
5. **Integration tests** — Prove it works end-to-end on localnet
6. **TypeScript SDK** (Codama generation + action layer) — Usable API
7. **CLI** (Commander.js wrapping SDK) — Operator tooling
8. **Devnet deployment + proof transactions** — Required for submission
9. **Documentation** (all .md files in docs/) — Required for submission
10. **SSS-3 Confidential Transfers** — First bonus tier
11. **Switchboard Oracle module** — Second bonus
12. **Backend indexer + Docker** — Third bonus
13. **Ratatui TUI** — Fourth bonus
14. **Next.js Frontend** — Fifth bonus
15. **Trident fuzz tests** — Polish
16. **Video recording + X post** — Submission requirement

Each step produces a shippable increment. If time runs out at step 9, you have a complete core submission. Everything after is bonus points.

---

## 13. Key Reference Links

| Resource | URL |
|---|---|
| Token-2022 Spec | `https://rareskills.io/post/token-2022` |
| Token Extensions Overview | `https://solana.com/solutions/token-extensions` |
| Permanent Delegate Guide | `https://solana.com/developers/guides/token-extensions/permanent-delegate` |
| Transfer Hook Guide | `https://solana.com/developers/guides/token-extensions/transfer-hook` |
| Transfer Hook (QuickNode) | `https://www.quicknode.com/guides/solana-development/spl-tokens/token-2022/transfer-hooks` |
| Confidential Balances | `https://www.solana-program.com/docs/confidential-balances` |
| Anchor Docs | `https://www.anchor-lang.com/docs` |
| Solana Cookbook | `https://solanacookbook.com/` |
| Codama SDK Generator | `https://github.com/codama-idl/codama` |
| Switchboard Docs | `https://docs.switchboard.xyz/` |
| Trident Fuzz | `https://crates.io/crates/trident-fuzz` |
| Ratatui TUI | `https://ratatui.rs/` |
| GENIUS Act (Wikipedia) | `https://en.wikipedia.org/wiki/GENIUS_Act` |
| GENIUS Act Legal Analysis | `https://www.lw.com/en/insights/the-genius-act-of-2025-stablecoin-legislation-adopted-in-the-us` |
| GENIUS Act Compliance Guide | `https://www.dotfile.com/blog-articles/genius-act-compliance-complete-guide-for-2026` |
| Bounty Repo | `https://github.com/solanabr/solana-stablecoin-standard` |
| Quality Reference (SVS) | `https://github.com/solanabr/solana-vault-standard` |
| SPL Token-2022 Source | `https://github.com/solana-labs/solana-program-library/tree/master/token/program-2022` |
| Helius Webhooks | `https://docs.helius.dev/webhooks/webhooks-summary` |
