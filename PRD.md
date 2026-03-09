# Product Requirements Document
# Solana Stablecoin Standards SDK (SSS-SDK)
### Version 1.0 — Hackathon Edition
**Classification:** Open Source  
**Author:** Solo Full-Stack Engineer  
**Build Window:** 7 Days  
**Target Network:** Solana Devnet (mainnet-ready architecture)

---

## Table of Contents

1. Product Overview
2. Problem Statement
3. Goals and Success Metrics
4. Target Users
5. System Architecture Overview
6. Detailed Feature Requirements
7. Preset Specifications (SSS-1 / SSS-2)
8. Smart Contract Requirements
9. API and SDK Interface Requirements
10. CLI Command Specifications
11. Security and Role Model
12. Data Flow Diagrams
13. Developer Experience Requirements
14. Testing Requirements
15. Deployment Requirements
16. Documentation Requirements
17. Non-Goals
18. Future Extensions
19. 7-Day Build Plan

---

## 1. Product Overview

The **Solana Stablecoin Standards SDK (SSS-SDK)** is an open-source developer toolkit — analogous to OpenZeppelin on Ethereum — that provides opinionated, auditable, and composable primitives for creating and operating stablecoins on Solana.

The SDK ships two canonical standards:

- **SSS-1 (Minimal Stablecoin):** A production-ready, permissioned stablecoin with mint/burn controls, freeze authority, and token metadata. Suited for projects that need a trusted issuer model without regulatory overhead.
- **SSS-2 (Compliant Stablecoin):** A fully compliance-ready stablecoin extending SSS-1 with blacklisting, permanent delegation for asset seizure, transfer hooks enforcing blacklist rules on every transfer, and regulatory tooling. Suited for fintechs and regulated institutions.

Both presets are built on **Solana Token-2022** extensions and an **Anchor** smart contract layer. The SDK surfaces everything through a typed **TypeScript SDK**, an operator-facing **Node.js CLI**, and optional **backend services** for event indexing and compliance enforcement.

---

## 2. Problem Statement

### The Gap

Stablecoin issuance on Solana today requires deep protocol expertise across Token-2022 extensions, Anchor macros, and off-chain coordination. There is no standardized, auditable starting point for developers or institutions:

- **Developers** must reverse-engineer existing stablecoin contracts (USDC, PYUSD) with no public SDK or reference implementation.
- **Fintechs and institutions** need compliance primitives (blacklist, seizure, transfer hooks) that do not exist as a composable package.
- **Hackathon and startup teams** waste 30–50% of build time re-implementing the same mint/burn/freeze boilerplate.
- **No ecosystem standard exists** — each stablecoin project reinvents the wheel, creating fragmentation and security risk.

### The Cost

Without a standard:
- Integration time for new stablecoin issuers: 4–8 weeks minimum.
- Risk of subtle bugs in authority management and token extension configuration.
- Compliance tooling built ad-hoc with no auditability trail.

### The Solution

SSS-SDK reduces stablecoin issuance to a configuration declaration and a single CLI command, while exposing every layer as composable TypeScript modules for full customization.

---

## 3. Goals and Success Metrics

### Primary Goals

| Goal | Success Metric |
|------|---------------|
| Launch SSS-1 stablecoin | `sss deploy --preset sss1` completes end-to-end on Devnet in < 60 seconds |
| Launch SSS-2 stablecoin | `sss deploy --preset sss2` includes working blacklist + transfer hook on Devnet |
| TypeScript SDK usability | Developer can mint tokens with < 10 lines of SDK code |
| CLI completeness | All 12 core CLI commands functional and documented |
| Test coverage | ≥ 80% unit test coverage on Anchor programs; ≥ 70% on SDK |
| Hackathon judges | Working Devnet deployment URL + all deliverables committed |

### Secondary Goals

- README that a junior developer can follow to deploy in 30 minutes.
- Modular architecture where compliance module is opt-in.
- All Anchor accounts follow security best practices (owner checks, signer checks, PDA validation).

---

## 4. Target Users

### Primary: Solana Developers (Individual / Startup)
- **Profile:** Familiar with TypeScript, some Rust experience, building DeFi or payments products.
- **Need:** Fast, correct stablecoin scaffolding without reading Token-2022 extension specs.
- **Key Use Case:** Deploy SSS-1 testnet stablecoin for a DeFi prototype in under an hour.

### Secondary: Fintech Product Teams
- **Profile:** Engineering team with blockchain integration experience, building a payment product on Solana.
- **Need:** Compliance-ready token with blacklist, freeze, and seizure capabilities. Auditable architecture.
- **Key Use Case:** Deploy SSS-2 for a licensed e-money product; integrate compliance module with existing sanctions screening service.

### Tertiary: Regulated Institutions (Banks, EMIs)
- **Profile:** Institutional treasury or payments team; may not have in-house Solana expertise.
- **Need:** Standards-compliant token issuance with clear role separation (issuer, compliance officer, operator).
- **Key Use Case:** Pilot CBDC or tokenized deposit using SSS-2 with a custom compliance backend.

### Quaternary: Hackathon / Open Source Contributors
- **Profile:** Builders evaluating Solana ecosystem; contributors extending the SDK.
- **Need:** Working examples, good DX, clear extension points.

---

## 5. System Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                        LAYER 3: PRESETS                      │
│          SSS-1 (Minimal)        SSS-2 (Compliant)            │
│          Custom Config          Community Presets             │
└────────────────────────┬────────────────────────────────────┘
                         │ composes
┌────────────────────────▼────────────────────────────────────┐
│                       LAYER 2: MODULES                        │
│   Compliance Module          Privacy Module (future)          │
│   (blacklist, seizure,       (confidential transfers)         │
│    sanctions, hooks)                                          │
└────────────────────────┬────────────────────────────────────┘
                         │ extends
┌────────────────────────▼────────────────────────────────────┐
│                      LAYER 1: BASE SDK                        │
│   Token Creation   Mint/Burn   Freeze/Thaw   Role Mgmt        │
│   Metadata         Config      Event Hooks   Utilities         │
└────────────────────────┬────────────────────────────────────┘
                         │ targets
┌────────────────────────▼────────────────────────────────────┐
│                SOLANA RUNTIME (Token-2022)                    │
│   SPL Token-2022    Anchor Programs    Metaplex Metadata       │
└─────────────────────────────────────────────────────────────┘
```

### Component Map

| Component | Technology | Purpose |
|-----------|-----------|---------|
| `programs/sss-base` | Rust + Anchor | Base token operations |
| `programs/sss-compliance` | Rust + Anchor | Blacklist + transfer hook |
| `sdk/` | TypeScript | Developer-facing SDK |
| `cli/` | Node.js (Commander.js) | Operator CLI |
| `services/indexer` | Node.js | On-chain event listener |
| `services/compliance-api` | Node.js + Express | Blacklist management REST API |
| `services/mint-coordinator` | Node.js | Mint/burn coordination |

---

## 6. Detailed Feature Requirements

### 6.1 Base SDK (Layer 1)

#### Token Creation
- Create a new SPL Token-2022 mint account
- Configurable decimals (0–9)
- Assign mint authority (keypair or multisig address)
- Assign freeze authority (optional; required for SSS-1 and SSS-2)
- Initialize token metadata extension (name, symbol, URI) in the same transaction
- Return: mint address, transaction signature

#### Mint
- Mint tokens to a specified associated token account (ATA)
- Auto-create ATA if it does not exist
- Amount specified in UI units; SDK handles decimal conversion internally
- Enforce: caller must hold mint authority
- Emit: `MintEvent { mint, destination, amount, authority, timestamp }`

#### Burn
- Burn tokens from a specified token account
- Enforce: caller must hold either (a) token account ownership or (b) permanent delegate authority
- Amount in UI units
- Emit: `BurnEvent { mint, source, amount, authority, timestamp }`

#### Freeze / Thaw
- Freeze a token account (blocks transfers from/to account)
- Thaw a frozen token account
- Enforce: caller must hold freeze authority
- Emit: `FreezeEvent` / `ThawEvent` with account address and authority

#### Role Management
- Define roles: `MintAuthority`, `FreezeAuthority`, `UpdateAuthority`, `ComplianceOfficer`, `PermanentDelegate`
- Transfer role to a new public key (two-step: propose → accept pattern recommended but not required for v1)
- Revoke role (set authority to `None`) — irreversible
- Query current role holders

#### Metadata
- Initialize token metadata using Token-2022 metadata extension
- Fields: `name`, `symbol`, `uri` (points to off-chain JSON), `additional_metadata` key-value store
- Update metadata URI (requires update authority)
- Additional metadata fields: `issuer`, `version`, `standard` (e.g., `"SSS-2"`)

#### Configuration Parameters
- `maxSupply`: optional hard cap; if set, mint instructions fail above cap
- `mintCooldown`: optional minimum seconds between mint operations
- `transferFee`: optional Token-2022 transfer fee extension (basis points + max fee)
- All config stored as on-chain PDA derived from mint address

---

### 6.2 Compliance Module (Layer 2)

#### Blacklist
- Maintain on-chain blacklist as a PDA account mapping `address → BlacklistEntry { reason, timestamp, added_by }`
- Add address to blacklist: requires `ComplianceOfficer` role
- Remove address from blacklist: requires `ComplianceOfficer` role
- Batch add/remove (up to 20 addresses per transaction)
- Query blacklist status of an address
- Emit: `BlacklistAddedEvent` / `BlacklistRemovedEvent`

#### Transfer Hook (SSS-2 requirement)
- Implement `TransferHook` interface from Token-2022 extension
- On every token transfer, the hook program checks:
  1. Is the source account's owner on the blacklist? → Reject if yes
  2. Is the destination account's owner on the blacklist? → Reject if yes
- Hook returns `TransferHookError::BlacklistedAccount` on rejection
- Hook account: `ExtraAccountMetaList` PDA initialized at mint creation
- Hook must be registered at mint creation; cannot be added post-creation on Token-2022

#### Permanent Delegate (Seizure)
- Register permanent delegate at Token-2022 mint level during creation
- Permanent delegate address stored in mint extension
- Seizure operation: permanent delegate transfers tokens from any account to a designated treasury/seizure account
- Seizure requires: `PermanentDelegate` role keypair signs the transaction
- Emit: `SeizureEvent { source, destination, amount, reason, authority, timestamp }`
- Seizure log stored on-chain as append-only PDA list (up to 100 entries; paginates via seed offset)

#### Sanctions Enforcement
- Off-chain compliance service queries blacklist PDA before approving mint/transfer operations
- Compliance service exposes REST endpoint `POST /check` accepting `{ address }` returning `{ blacklisted: bool, reason?: string }`
- SDK's `complianceCheck(address)` method calls this endpoint
- For on-chain enforcement: transfer hook is the authoritative gate; compliance service is advisory

---

### 6.3 CLI Tool

Full specification in Section 10.

---

### 6.4 Backend Services

#### Mint/Burn Coordination Service
- Purpose: Coordinate multi-step mint/burn operations; handle transaction retry and confirmation
- Exposes: REST API `POST /mint`, `POST /burn`
- Request auth: API key (Bearer token) + keypair signing on the Solana side
- Transaction submission: uses `@solana/web3.js` with exponential backoff retry (max 5 attempts)
- Returns: `{ signature, status, confirmedAt }`

#### Blockchain Event Listener / Indexer
- Subscribes to Solana program logs via `connection.onLogs(programId, callback)`
- Parses Anchor event discriminators to decode `MintEvent`, `BurnEvent`, `FreezeEvent`, `BlacklistAddedEvent`, `SeizureEvent`
- Stores decoded events in local SQLite database (`events.db`) with columns: `id, event_type, mint, data_json, signature, slot, timestamp`
- Exposes: REST `GET /events?mint=&type=&limit=&offset=`
- Reconnects automatically on WebSocket disconnect (exponential backoff)

#### Compliance Service
- Purpose: Blacklist management API bridging off-chain and on-chain state
- `POST /blacklist/add` — adds address on-chain via compliance officer keypair
- `POST /blacklist/remove` — removes address on-chain
- `GET /blacklist/:address` — returns blacklist status
- `POST /check` — fast off-chain lookup (local cache + on-chain fallback)
- Cache: in-memory LRU cache (1,000 entries, 60-second TTL)
- Auth: API key required for write endpoints

---

### 6.5 TypeScript SDK

Full specification in Section 9.

---

## 7. Preset Specifications

### 7.1 SSS-1: Minimal Stablecoin

**Purpose:** Simplest possible production-grade stablecoin. Trusted issuer model, no compliance overhead.

#### Required Token-2022 Extensions
- `MintCloseAuthority` — allows closing the mint account if supply is 0
- `MetadataPointer` — points to embedded metadata
- `TokenMetadata` — embedded name/symbol/URI

#### Required Roles
| Role | Description | Required |
|------|-------------|----------|
| `mint_authority` | Can mint new tokens | Yes |
| `freeze_authority` | Can freeze/thaw token accounts | Yes |
| `update_authority` | Can update token metadata | Yes |

#### Excluded Extensions (explicitly not included)
- Transfer hook
- Permanent delegate
- Transfer fee (optional; can be added via custom config)
- Confidential transfers

#### SSS-1 Config Schema
```typescript
interface SSS1Config {
  name: string;               // Token name, e.g. "MyStablecoin"
  symbol: string;             // Token symbol, e.g. "MYUSD"
  uri: string;                // Metadata JSON URI
  decimals: number;           // 0-9, typically 6
  mintAuthority: PublicKey;
  freezeAuthority: PublicKey;
  updateAuthority: PublicKey;
  maxSupply?: bigint;         // Optional hard cap
}
```

#### Deployment Output
```json
{
  "standard": "SSS-1",
  "mint": "<address>",
  "mintAuthority": "<address>",
  "freezeAuthority": "<address>",
  "updateAuthority": "<address>",
  "decimals": 6,
  "network": "devnet",
  "deployedAt": "<ISO timestamp>",
  "txSignature": "<signature>"
}
```

---

### 7.2 SSS-2: Compliant Stablecoin

**Purpose:** Full compliance-ready stablecoin for regulated or institutional use. Extends SSS-1 with enforcement primitives.

#### Required Token-2022 Extensions (in addition to SSS-1)
- `PermanentDelegate` — enables seizure by delegated authority
- `TransferHook` — registers hook program called on every transfer

#### Required Roles (in addition to SSS-1)
| Role | Description | Required |
|------|-------------|----------|
| `compliance_officer` | Can add/remove addresses from blacklist | Yes |
| `permanent_delegate` | Can seize tokens from any account | Yes |

#### Transfer Hook Behavior
1. Token-2022 runtime calls the hook program after every transfer instruction
2. Hook program loads `ExtraAccountMetaList` PDA
3. Checks source wallet → blacklist PDA lookup
4. Checks destination wallet → blacklist PDA lookup
5. Returns `Ok(())` if both clear; returns error if either is blacklisted
6. Failed transfers are rejected at the Token-2022 level — no partial execution

#### Blacklist Storage
- PDA seed: `["blacklist", mint_address, entry_index_as_u64_le_bytes]`
- Index registry PDA: `["blacklist_registry", mint_address]` — stores `{ count: u64, entries: Vec<Pubkey> }`
- For lookup efficiency, also store reverse PDA: `["blacklist_entry", mint_address, wallet_address]` → `{ blacklisted: bool, reason: String, timestamp: i64 }`

#### SSS-2 Config Schema
```typescript
interface SSS2Config extends SSS1Config {
  complianceOfficer: PublicKey;
  permanentDelegate: PublicKey;
  hookProgramId: PublicKey;        // The deployed transfer hook program
  seizureTreasury: PublicKey;      // Default destination for seized tokens
}
```

#### Deployment Output
```json
{
  "standard": "SSS-2",
  "mint": "<address>",
  "mintAuthority": "<address>",
  "freezeAuthority": "<address>",
  "updateAuthority": "<address>",
  "complianceOfficer": "<address>",
  "permanentDelegate": "<address>",
  "hookProgram": "<address>",
  "blacklistRegistry": "<PDA address>",
  "seizureTreasury": "<address>",
  "decimals": 6,
  "network": "devnet",
  "deployedAt": "<ISO timestamp>",
  "txSignatures": {
    "mintCreation": "<sig>",
    "hookInit": "<sig>",
    "blacklistInit": "<sig>"
  }
}
```

---

## 8. Smart Contract Requirements

### 8.1 Program Structure

```
programs/
├── sss-base/
│   ├── src/
│   │   ├── lib.rs              # Program entrypoint, declare_id!
│   │   ├── instructions/
│   │   │   ├── create_mint.rs
│   │   │   ├── mint_tokens.rs
│   │   │   ├── burn_tokens.rs
│   │   │   ├── freeze_account.rs
│   │   │   ├── thaw_account.rs
│   │   │   └── update_metadata.rs
│   │   ├── state/
│   │   │   └── mint_config.rs  # MintConfig PDA
│   │   ├── events.rs
│   │   └── errors.rs
└── sss-compliance/
    ├── src/
    │   ├── lib.rs
    │   ├── instructions/
    │   │   ├── init_blacklist.rs
    │   │   ├── add_to_blacklist.rs
    │   │   ├── remove_from_blacklist.rs
    │   │   ├── seize_tokens.rs
    │   │   └── execute_transfer_hook.rs  # TransferHook interface
    │   ├── state/
    │   │   ├── blacklist_registry.rs
    │   │   └── blacklist_entry.rs
    │   ├── events.rs
    │   └── errors.rs
```

### 8.2 Account Structures

```rust
// MintConfig PDA — stores per-mint settings
// Seed: ["mint_config", mint.key()]
#[account]
pub struct MintConfig {
    pub mint: Pubkey,
    pub standard: u8,           // 1 = SSS-1, 2 = SSS-2
    pub max_supply: Option<u64>,
    pub mint_cooldown: Option<i64>,
    pub last_mint_timestamp: i64,
    pub bump: u8,
}

// BlacklistRegistry PDA
// Seed: ["blacklist_registry", mint.key()]
#[account]
pub struct BlacklistRegistry {
    pub mint: Pubkey,
    pub count: u64,
    pub bump: u8,
}

// BlacklistEntry PDA (one per blacklisted address)
// Seed: ["blacklist_entry", mint.key(), wallet.key()]
#[account]
pub struct BlacklistEntry {
    pub mint: Pubkey,
    pub wallet: Pubkey,
    pub reason: String,         // max 128 chars
    pub added_by: Pubkey,
    pub timestamp: i64,
    pub bump: u8,
}
```

### 8.3 Instruction Accounts

**create_mint (SSS-1):**
```rust
#[derive(Accounts)]
pub struct CreateMintSSS1<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(
        init,
        payer = payer,
        mint::decimals = decimals,
        mint::authority = mint_authority,
        mint::freeze_authority = freeze_authority,
        extensions::metadata_pointer::authority = update_authority,
        extensions::metadata_pointer::metadata_address = mint,
    )]
    pub mint: Box<InterfaceAccount<'info, Mint>>,
    /// CHECK: mint authority
    pub mint_authority: AccountInfo<'info>,
    /// CHECK: freeze authority
    pub freeze_authority: AccountInfo<'info>,
    /// CHECK: update authority
    pub update_authority: AccountInfo<'info>,
    #[account(
        init,
        payer = payer,
        space = MintConfig::INIT_SPACE,
        seeds = [b"mint_config", mint.key().as_ref()],
        bump,
    )]
    pub mint_config: Account<'info, MintConfig>,
    pub token_program: Program<'info, Token2022>,
    pub system_program: Program<'info, System>,
}
```

**execute_transfer_hook (SSS-2):**
```rust
// Implements the TransferHook interface required by Token-2022
#[derive(Accounts)]
pub struct ExecuteTransferHook<'info> {
    pub source_token: InterfaceAccount<'info, TokenAccount>,
    pub mint: InterfaceAccount<'info, Mint>,
    pub destination_token: InterfaceAccount<'info, TokenAccount>,
    /// CHECK: Token-2022 transfer hook authority
    pub owner: AccountInfo<'info>,
    #[account(
        seeds = [b"extra-account-metas", mint.key().as_ref()],
        bump,
    )]
    pub extra_account_meta_list: AccountInfo<'info>,
    // Blacklist entry PDAs injected as extra accounts
    /// CHECK: blacklist entry for source owner
    pub source_blacklist_entry: AccountInfo<'info>,
    /// CHECK: blacklist entry for destination owner
    pub destination_blacklist_entry: AccountInfo<'info>,
}
```

### 8.4 Error Codes

```rust
// sss-base errors
#[error_code]
pub enum SSSBaseError {
    #[msg("Caller is not the mint authority")]
    NotMintAuthority,
    #[msg("Caller is not the freeze authority")]
    NotFreezeAuthority,
    #[msg("Max supply would be exceeded")]
    MaxSupplyExceeded,
    #[msg("Mint cooldown period has not elapsed")]
    MintCooldownActive,
    #[msg("Authority has been revoked")]
    AuthorityRevoked,
}

// sss-compliance errors
#[error_code]
pub enum SSSComplianceError {
    #[msg("Source account is blacklisted")]
    SourceBlacklisted,
    #[msg("Destination account is blacklisted")]
    DestinationBlacklisted,
    #[msg("Caller is not the compliance officer")]
    NotComplianceOfficer,
    #[msg("Caller is not the permanent delegate")]
    NotPermanentDelegate,
    #[msg("Address is not on the blacklist")]
    AddressNotBlacklisted,
    #[msg("Address is already on the blacklist")]
    AddressAlreadyBlacklisted,
}
```

### 8.5 Events

```rust
// All events emitted via Anchor's emit! macro
#[event] pub struct MintEvent { pub mint: Pubkey, pub destination: Pubkey, pub amount: u64, pub authority: Pubkey, pub timestamp: i64 }
#[event] pub struct BurnEvent { pub mint: Pubkey, pub source: Pubkey, pub amount: u64, pub authority: Pubkey, pub timestamp: i64 }
#[event] pub struct FreezeEvent { pub mint: Pubkey, pub account: Pubkey, pub authority: Pubkey, pub timestamp: i64 }
#[event] pub struct ThawEvent { pub mint: Pubkey, pub account: Pubkey, pub authority: Pubkey, pub timestamp: i64 }
#[event] pub struct BlacklistAddedEvent { pub mint: Pubkey, pub wallet: Pubkey, pub reason: String, pub officer: Pubkey, pub timestamp: i64 }
#[event] pub struct BlacklistRemovedEvent { pub mint: Pubkey, pub wallet: Pubkey, pub officer: Pubkey, pub timestamp: i64 }
#[event] pub struct SeizureEvent { pub mint: Pubkey, pub source: Pubkey, pub destination: Pubkey, pub amount: u64, pub reason: String, pub delegate: Pubkey, pub timestamp: i64 }
```

---

## 9. API and SDK Interface Requirements

### 9.1 SDK Package Structure

```
sdk/
├── src/
│   ├── index.ts                  # Public exports
│   ├── client.ts                 # SSSClient main class
│   ├── presets/
│   │   ├── sss1.ts               # SSS1Preset
│   │   └── sss2.ts               # SSS2Preset
│   ├── modules/
│   │   ├── base.ts               # BaseModule
│   │   └── compliance.ts         # ComplianceModule
│   ├── types.ts                  # All TypeScript interfaces
│   ├── errors.ts                 # SDK error classes
│   └── utils.ts                  # Helpers (decimals, PDA derivation)
├── package.json
└── tsconfig.json
```

### 9.2 Core SDK Interfaces

```typescript
// Main client
class SSSClient {
  constructor(connection: Connection, wallet: Wallet)

  // Preset factory methods
  async deploySSS1(config: SSS1Config): Promise<DeploymentResult>
  async deploySSS2(config: SSS2Config): Promise<DeploymentResult>

  // Base operations
  base: BaseModule

  // Compliance operations (SSS-2 only)
  compliance: ComplianceModule
}

// Base module
class BaseModule {
  async mint(params: {
    mint: PublicKey
    destination: PublicKey
    amount: number          // UI units
    authority: Keypair
  }): Promise<TransactionResult>

  async burn(params: {
    mint: PublicKey
    source: PublicKey
    amount: number
    authority: Keypair
  }): Promise<TransactionResult>

  async freeze(mint: PublicKey, account: PublicKey, authority: Keypair): Promise<TransactionResult>
  async thaw(mint: PublicKey, account: PublicKey, authority: Keypair): Promise<TransactionResult>

  async getBalance(mint: PublicKey, wallet: PublicKey): Promise<number>
  async getTotalSupply(mint: PublicKey): Promise<number>
  async getMintConfig(mint: PublicKey): Promise<MintConfig>
}

// Compliance module
class ComplianceModule {
  async addToBlacklist(params: {
    mint: PublicKey
    wallet: PublicKey
    reason: string
    officer: Keypair
  }): Promise<TransactionResult>

  async removeFromBlacklist(params: {
    mint: PublicKey
    wallet: PublicKey
    officer: Keypair
  }): Promise<TransactionResult>

  async isBlacklisted(mint: PublicKey, wallet: PublicKey): Promise<BlacklistStatus>

  async seize(params: {
    mint: PublicKey
    source: PublicKey
    destination: PublicKey
    amount: number
    reason: string
    delegate: Keypair
  }): Promise<TransactionResult>

  async getBlacklist(mint: PublicKey): Promise<BlacklistEntry[]>
}

// Result types
interface TransactionResult {
  signature: string
  confirmedAt: number     // slot
  success: boolean
}

interface DeploymentResult {
  mint: PublicKey
  standard: 'SSS-1' | 'SSS-2'
  roles: Record<string, PublicKey>
  signatures: Record<string, string>
  configPDA: PublicKey
}

interface BlacklistStatus {
  blacklisted: boolean
  reason?: string
  timestamp?: number
  addedBy?: PublicKey
}
```

### 9.3 SDK Usage Examples

**Deploy SSS-1 (5 lines):**
```typescript
import { SSSClient } from '@sss-sdk/core'
const client = new SSSClient(connection, wallet)
const result = await client.deploySSS1({
  name: 'MyUSD', symbol: 'MYUSD', uri: 'https://...', decimals: 6,
  mintAuthority: wallet.publicKey, freezeAuthority: wallet.publicKey, updateAuthority: wallet.publicKey
})
console.log('Mint:', result.mint.toBase58())
```

**Mint tokens (3 lines):**
```typescript
await client.base.mint({
  mint: mintAddress, destination: recipientWallet, amount: 1000, authority: mintAuthorityKeypair
})
```

**Blacklist an address (SSS-2):**
```typescript
await client.compliance.addToBlacklist({
  mint: mintAddress, wallet: suspiciousAddress,
  reason: 'OFAC SDN match', officer: complianceOfficerKeypair
})
```

---

## 10. CLI Command Specifications

### 10.1 CLI Entry and Global Options

```
sss [command] [options]

Global options:
  --network, -n     Solana cluster: devnet | mainnet-beta | localnet  [default: devnet]
  --keypair, -k     Path to operator keypair JSON                     [default: ~/.config/solana/id.json]
  --mint, -m        Mint address (required for most token commands)
  --json            Output raw JSON instead of formatted table
  --verbose, -v     Show transaction details and logs
```

### 10.2 Command Reference

#### `sss deploy`
Deploy a new stablecoin from a preset or config file.

```
sss deploy [options]

Options:
  --preset <name>     SSS preset: sss1 | sss2                [required if no --config]
  --config <path>     Path to JSON config file               [required if no --preset]
  --name <string>     Token name
  --symbol <string>   Token symbol
  --decimals <n>      Token decimals                         [default: 6]
  --uri <url>         Metadata JSON URI
  --dry-run           Simulate without broadcasting

Examples:
  sss deploy --preset sss1 --name "MyUSD" --symbol "MYUSD" --uri https://my.meta/token.json
  sss deploy --preset sss2 --config ./sss2-config.json
  sss deploy --config ./custom.json --dry-run
```

Output:
```
✓ Deploying SSS-1 stablecoin on devnet...
✓ Mint created:          AbCdEf...XyZ
✓ Metadata initialized:  name=MyUSD symbol=MYUSD
✓ Config PDA:            PqRsTu...789
✓ Deployment complete in 4.2s

Saved to: ./sss-deployment-MYUSD-1710000000.json
```

#### `sss mint`
Mint tokens to a destination wallet.

```
sss mint --mint <address> --to <wallet> --amount <number> [options]

Options:
  --mint     Mint address                [required]
  --to       Destination wallet address  [required]
  --amount   Amount in UI units          [required]
```

#### `sss burn`
Burn tokens from a source account.

```
sss burn --mint <address> --from <wallet> --amount <number>
```

#### `sss freeze`
Freeze a token account.

```
sss freeze --mint <address> --account <wallet>
```

#### `sss thaw`
Thaw a frozen token account.

```
sss thaw --mint <address> --account <wallet>
```

#### `sss blacklist add`
Add an address to the SSS-2 blacklist.

```
sss blacklist add --mint <address> --wallet <address> --reason <string>

Options:
  --reason    Human-readable reason for blacklisting (stored on-chain, max 128 chars)
```

#### `sss blacklist remove`
Remove an address from the blacklist.

```
sss blacklist remove --mint <address> --wallet <address>
```

#### `sss blacklist check`
Check if an address is blacklisted.

```
sss blacklist check --mint <address> --wallet <address>

Output:
  Status:    BLACKLISTED
  Reason:    OFAC SDN match
  Added by:  ComplianceOfficer1...abc
  Timestamp: 2026-03-09T10:00:00Z
```

#### `sss blacklist list`
List all blacklisted addresses for a mint.

```
sss blacklist list --mint <address> [--limit 50] [--offset 0]
```

#### `sss seize`
Seize tokens from an account (SSS-2, permanent delegate only).

```
sss seize --mint <address> --from <wallet> --to <wallet> --amount <number> --reason <string>
```

#### `sss info`
Display mint and deployment info.

```
sss info --mint <address>

Output:
  Standard:           SSS-2
  Name:               MyUSD
  Symbol:             MYUSD
  Decimals:           6
  Total Supply:       1,000,000.000000
  Mint Authority:     AbCd...
  Freeze Authority:   AbCd...
  Compliance Officer: EfGh...
  Permanent Delegate: IjKl...
  Blacklisted addrs:  3
  Hook Program:       MnOp...
  Network:            devnet
```

#### `sss events`
Stream or query on-chain events for a mint.

```
sss events --mint <address> [--type mint|burn|freeze|blacklist|seize] [--follow]

Options:
  --follow    Stream live events (like tail -f)
  --since     ISO timestamp or slot number
  --limit     Max events to return  [default: 20]
```

#### `sss validate`
Validate a deployment output file.

```
sss validate --file ./sss-deployment-MYUSD-*.json

Checks:
  ✓ Mint account exists on-chain
  ✓ All authority addresses match deployment file
  ✓ Correct Token-2022 extensions present
  ✓ Transfer hook registered (SSS-2 only)
  ✓ Blacklist registry initialized (SSS-2 only)
```

---

## 11. Security and Role Model

### 11.1 Role Hierarchy

```
Owner / Deployer
    │
    ├── MintAuthority          → mint tokens
    ├── FreezeAuthority        → freeze/thaw accounts
    ├── UpdateAuthority        → update token metadata
    ├── ComplianceOfficer      → blacklist management        [SSS-2]
    └── PermanentDelegate      → token seizure               [SSS-2]
```

- All roles are independent keypairs; one keypair MAY hold multiple roles (not recommended for production).
- Role addresses are stored in the `MintConfig` PDA; on-chain instructions validate against these stored addresses.
- Roles can be revoked (set to `None`) but cannot be re-assigned after revocation in v1 (prevents griefing; v2 will add two-step transfer).

### 11.2 On-Chain Security Checks

Every Anchor instruction MUST include:

| Check | Implementation |
|-------|---------------|
| Signer verification | `Signer<'info>` constraint |
| Owner check on PDAs | `has_one` or manual `require_keys_eq!` |
| Mint match | `has_one = mint` on all token accounts |
| PDA bump validation | `seeds` + `bump` constraints |
| Overflow protection | Use `checked_add`, `checked_sub` or `u64::checked_*` |
| Reentrancy | Not applicable on Solana; note in audit README |

### 11.3 Known Threat Vectors

| Threat | Mitigation |
|--------|-----------|
| Authority key compromise | Recommend multisig (Squads) for production; document clearly |
| Hook bypass (direct transfer without hook) | Not possible on Token-2022; hook is enforced at runtime |
| Blacklist PDA spoofing | PDA seeds are deterministic; SDK derives and validates |
| Seizure misuse | On-chain SeizureEvent log is append-only; audit trail immutable |
| Supply manipulation | `max_supply` check in `mint_tokens` instruction |

---

## 12. Data Flow Diagrams

### 12.1 SSS-1 Token Deployment Flow

```
Developer (SDK/CLI)
        │
        ▼
  1. Build CreateMintSSS1 instruction
     (mint + config PDA + metadata init)
        │
        ▼
  2. Sign with payer keypair
        │
        ▼
  3. Submit to Solana RPC
        │
        ▼
  4. Token-2022 Program
     creates mint account with extensions
        │
        ▼
  5. sss-base Program
     initializes MintConfig PDA
        │
        ▼
  6. Token-2022 initializes embedded metadata
        │
        ▼
  7. Return: mint address + tx signature
        │
        ▼
  8. SDK writes deployment JSON to disk
```

### 12.2 SSS-2 Transfer Flow (with hook)

```
User initiates transfer
        │
        ▼
  1. Build Token-2022 Transfer instruction
     (includes ExtraAccountMetaList)
        │
        ▼
  2. Token-2022 runtime: pre-transfer hook call
        │
        ▼
  3. sss-compliance hook program loads:
     - source_blacklist_entry PDA
     - destination_blacklist_entry PDA
        │
        ├── Either blacklisted?
        │       YES → Return TransferHookError
        │               → Transfer REJECTED
        │
        └── Both clear?
                YES → Return Ok(())
                        │
                        ▼
              4. Token-2022 completes transfer
                        │
                        ▼
              5. Token balances updated on-chain
```

### 12.3 Blacklist Add Flow

```
Compliance Officer (CLI: sss blacklist add)
        │
        ▼
  1. Build AddToBlacklist instruction
     (mint, wallet, reason)
        │
        ▼
  2. Sign with ComplianceOfficer keypair
        │
        ▼
  3. sss-compliance validates:
     - Signer == compliance_officer in MintConfig
        │
        ▼
  4. Create BlacklistEntry PDA
     (seed: ["blacklist_entry", mint, wallet])
        │
        ▼
  5. Increment BlacklistRegistry count
        │
        ▼
  6. Emit BlacklistAddedEvent
        │
        ▼
  7. Indexer picks up event → stores in events.db
        │
        ▼
  8. Compliance service cache invalidated for wallet
```

### 12.4 Seizure Flow

```
Compliance Officer / Legal Trigger
        │
        ▼
  1. CLI: sss seize --from <wallet> --to <treasury> --amount --reason
        │
        ▼
  2. SDK builds seize instruction
     (permanent_delegate signs)
        │
        ▼
  3. sss-compliance validates:
     - Signer == permanent_delegate in MintConfig
     - source token account has sufficient balance
        │
        ▼
  4. Token-2022 executes delegated transfer
     (permanent delegate bypasses owner signature)
        │
        ▼
  5. Emit SeizureEvent (append-only on-chain log)
        │
        ▼
  6. Indexer stores SeizureEvent in events.db
```

---

## 13. Developer Experience Requirements

### 13.1 Repository Structure

```
sss-sdk/
├── programs/
│   ├── sss-base/
│   └── sss-compliance/
├── sdk/
├── cli/
├── services/
│   ├── indexer/
│   ├── compliance-api/
│   └── mint-coordinator/
├── examples/
│   ├── deploy-sss1.ts
│   ├── deploy-sss2.ts
│   └── compliance-workflow.ts
├── tests/
│   ├── anchor/        # Anchor integration tests
│   └── sdk/           # SDK unit tests
├── docs/
│   ├── getting-started.md
│   ├── sss1-guide.md
│   ├── sss2-guide.md
│   └── api-reference.md
├── Anchor.toml
├── package.json       # monorepo root (pnpm workspaces)
└── README.md
```

### 13.2 Getting Started (Target: < 10 minutes to first deployment)

```bash
# 1. Install
npm install -g @sss-sdk/cli

# 2. Configure keypair (or use existing)
solana-keygen new --outfile ./my-keypair.json

# 3. Get devnet SOL
solana airdrop 2 --keypair ./my-keypair.json --url devnet

# 4. Deploy SSS-1
sss deploy --preset sss1 \
  --name "MyUSD" --symbol "MYUSD" \
  --uri "https://raw.githubusercontent.com/.../metadata.json" \
  --keypair ./my-keypair.json
```

### 13.3 Required DX Properties

- All SDK methods return typed results; no `any` types in public API
- All errors have a `.code` string (e.g., `"SSS_NOT_MINT_AUTHORITY"`) and a human-readable `.message`
- Deployment outputs write to JSON file automatically with timestamp in filename
- CLI outputs human-readable table by default; `--json` flag for machine parsing
- SDK ships TypeScript type definitions (`.d.ts`) bundled
- All async methods accept optional `{ commitment: Commitment }` override
- SDK README includes copy-paste quickstart that works without modification

---

## 14. Testing Requirements

### 14.1 Anchor Program Tests (TypeScript, Anchor test framework)

| Test Suite | Tests | Coverage Target |
|-----------|-------|----------------|
| `sss-base` | create_mint, mint_tokens, burn_tokens, freeze, thaw, update_metadata | ≥ 80% instruction coverage |
| `sss-compliance` | init_blacklist, add/remove blacklist, transfer hook accept, transfer hook reject, seize | ≥ 80% |
| Error cases | Each error code has at least one negative test | 100% error codes covered |
| SSS-1 preset end-to-end | Full deploy → mint → transfer → freeze → burn cycle | Pass |
| SSS-2 preset end-to-end | Full deploy → mint → blacklist → transfer reject → seize cycle | Pass |

#### Required Negative Tests
- Mint by non-authority → expect `NotMintAuthority`
- Transfer to blacklisted address → expect `DestinationBlacklisted`
- Seize by non-delegate → expect `NotPermanentDelegate`
- Mint beyond max supply → expect `MaxSupplyExceeded`
- Blacklist address already blacklisted → expect `AddressAlreadyBlacklisted`

### 14.2 SDK Unit Tests (Jest)

- `BaseModule.mint` — mock RPC, assert instruction built correctly
- `BaseModule.burn` — assert amount conversion (UI → lamports)
- `ComplianceModule.addToBlacklist` — assert PDA derivation
- `ComplianceModule.isBlacklisted` — mock account fetch, test true/false paths
- `SSS1Config` validation — assert required fields, reject invalid decimals
- `SSS2Config` validation — assert hook program required

### 14.3 CLI Integration Tests (bash scripts)

```bash
# test/cli/sss1-e2e.sh
# 1. sss deploy --preset sss1 → capture mint address
# 2. sss mint --mint $MINT --to $WALLET --amount 1000
# 3. sss info --mint $MINT → assert supply = 1000
# 4. sss freeze --mint $MINT --account $WALLET
# 5. sss burn → expect error (frozen)
# 6. sss thaw --mint $MINT --account $WALLET
# 7. sss burn --mint $MINT --from $WALLET --amount 500
# 8. sss info → assert supply = 500
```

---

## 15. Deployment Requirements

### 15.1 Devnet Deployment (Required for Hackathon)

- Both `sss-base` and `sss-compliance` programs deployed to Devnet
- Program IDs committed in `Anchor.toml` and `sdk/src/constants.ts`
- At least one SSS-1 and one SSS-2 token live on Devnet at submission time
- Devnet deployment addresses documented in README

### 15.2 Deployment Checklist

```
[ ] anchor build --verifiable
[ ] anchor deploy --provider.cluster devnet
[ ] Record program IDs in Anchor.toml
[ ] Update SDK constants with program IDs
[ ] Run anchor test against devnet
[ ] Deploy SSS-1 example token: sss deploy --preset sss1 ...
[ ] Deploy SSS-2 example token: sss deploy --preset sss2 ...
[ ] Run sss validate against both deployments
[ ] Add deployment artifacts to /deployments/ folder in repo
```

### 15.3 Environment Configuration

```
.env (not committed)
SOLANA_NETWORK=devnet
RPC_URL=https://api.devnet.solana.com
OPERATOR_KEYPAIR_PATH=./keypairs/operator.json
COMPLIANCE_OFFICER_KEYPAIR_PATH=./keypairs/compliance.json
PERMANENT_DELEGATE_KEYPAIR_PATH=./keypairs/delegate.json
COMPLIANCE_API_KEY=<secret>
```

---

## 16. Documentation Requirements

### 16.1 Required Docs (Minimum for Hackathon)

| Document | Location | Contents |
|----------|----------|---------|
| README.md | Root | Overview, quickstart, links to all docs |
| getting-started.md | /docs | Install, configure, first deployment |
| sss1-guide.md | /docs | SSS-1 complete walkthrough with code |
| sss2-guide.md | /docs | SSS-2 complete walkthrough with code |
| api-reference.md | /docs | All SDK classes, methods, types |
| cli-reference.md | /docs | All CLI commands with examples |
| architecture.md | /docs | System architecture, data flows |
| SECURITY.md | Root | Role model, threat vectors, best practices |

### 16.2 Code Documentation

- Every exported SDK class and method has JSDoc comment with `@param`, `@returns`, `@throws`, `@example`
- Every Anchor instruction has a doc comment explaining its purpose and authority requirements
- Every error code has an explanatory comment

---

## 17. Non-Goals

The following are explicitly **out of scope** for v1:

- **Mainnet deployment** — Devnet only; mainnet requires audit
- **Multisig authority management** — Recommended (Squads) but not built-in
- **Confidential/private transfers** — Future SSS-3 standard
- **Oracle price feeds** — No on-chain price anchoring in v1
- **Cross-chain bridge** — Wormhole integration is future work
- **Yield-bearing stablecoin mechanics** — No interest accrual
- **Governance module** — No on-chain DAO voting for parameter changes
- **Frontend dApp** — Optional bonus only; not in core scope
- **Mainnet compliance legal review** — SDK provides tools; legal counsel is user's responsibility
- **OFAC/sanctions list auto-sync** — Compliance service has manual API; auto-sync is future
- **Key management / HSM integration** — SDK accepts keypairs; KMS is user's infrastructure concern

---

## 18. Future Extensions

### SSS-3: Private Stablecoin
- Uses Token-2022 **Confidential Transfers** extension
- Transfer amounts hidden from public ledger
- Auditor role can decrypt balances (regulatory backdoor)
- Builds on SSS-2 compliance infrastructure

### Oracle Module
- On-chain price feed integration (Pyth, Switchboard)
- Mint gated by collateral ratio checks
- Automated collateral monitoring service

### Multisig Role Management
- Native Squads Protocol integration for all authority roles
- Threshold signatures for mint operations
- Time-locked authority transfers

### SSS-4: Yield-Bearing Stablecoin
- Interest accrual via interest-bearing token extension (Token-2022)
- Configurable APY rate by update authority
- Integration with on-chain yield sources

### Governance Module
- On-chain parameter governance (max supply, cooldown, fees)
- Token-weighted voting
- Timelock on parameter changes

### Auto-Sanctions Sync
- Cron service polling OFAC SDN list
- Automatic blacklist proposals (require compliance officer confirmation)
- Chainalysis / TRM Labs API integration adapters

---

## 19. 7-Day Build Plan (Solo Dev)

### Day 1 — Anchor Foundation
- Set up monorepo (pnpm workspaces + Anchor.toml)
- Implement `sss-base` program: `create_mint`, `mint_tokens`, `burn_tokens`
- Write MintConfig PDA + basic tests

### Day 2 — Base Program Completion + SSS-1 Preset
- Implement `freeze_account`, `thaw_account`, `update_metadata`
- All error codes and events for sss-base
- Write SSS-1 end-to-end Anchor test (passes locally)

### Day 3 — Compliance Program
- Implement `sss-compliance`: init_blacklist, add/remove, blacklist entry PDAs
- Implement `execute_transfer_hook` (TransferHook interface)
- Implement `seize_tokens`
- Write SSS-2 Anchor tests

### Day 4 — TypeScript SDK
- Build `SSSClient`, `BaseModule`, `ComplianceModule`
- Implement `deploySSS1`, `deploySSS2` preset methods
- SDK unit tests (Jest)

### Day 5 — CLI Tool
- Implement all 12 CLI commands using Commander.js
- Wire CLI to SDK
- CLI integration test scripts

### Day 6 — Devnet Deployment + Backend Services
- Deploy both programs to Devnet
- Implement indexer service (event listener + SQLite)
- Implement compliance-api service
- Deploy SSS-1 and SSS-2 example tokens to Devnet
- Run `sss validate` against both

### Day 7 — Docs, Polish, Submission
- Write all required documentation
- Record demo (screen capture: deploy → mint → blacklist → seize)
- Final test pass (anchor test + SDK tests + CLI e2e)
- Tag `v1.0.0` and submit
