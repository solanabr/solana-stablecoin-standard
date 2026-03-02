# SSS Architecture

Solana Stablecoin Standard (SSS) is a two-program system built on Token-2022 that provides a production-ready framework for issuing and managing stablecoins on Solana. It ships two opinionated presets — SSS-1 for minimal CBDC-style tokens and SSS-2 for fully regulated, compliance-grade tokens — along with a TypeScript SDK, CLI, and backend REST service.

---

## System Overview

```
┌────────────────────────────────────────────────────────────────────┐
│                        Client Layer                                │
│  ┌──────────────┐  ┌──────────────────┐  ┌──────────────────────┐ │
│  │  sss-token   │  │  @stbr/sss-sdk   │  │  REST Backend        │ │
│  │  (CLI)       │  │  (TypeScript)    │  │  (port 3000)         │ │
│  └──────┬───────┘  └────────┬─────────┘  └──────────┬───────────┘ │
│         └──────────────────┬┘                        │             │
│                            │ uses SolanaStablecoin / SssClient     │
└────────────────────────────┼────────────────────────────────────── ┘
                             │ Anchor RPC / web3.js
┌────────────────────────────▼───────────────────────────────────────┐
│                      Solana Programs                               │
│                                                                    │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  SSS Main Program                                            │  │
│  │  Aaw7RSm8fXXAfvDy9wS1FimFEmnHkzYtDmZCRgZg9pVm              │  │
│  │                                                              │  │
│  │  State PDAs:                                                 │  │
│  │   • StablecoinConfig  [stablecoin-config, mint]              │  │
│  │   • RolesConfig       [roles-config, mint]                   │  │
│  │   • BlacklistEntry    [blacklist, mint, target]  (SSS-2)     │  │
│  │   • AuditLogEntry     [audit, mint, index]                   │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                    │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  SSS Transfer Hook Program                (SSS-2 only)       │  │
│  │  2fwDqWAneoErwq2dpMDjKibTx8kNJ7RLcEDyX5uzzdN8               │  │
│  │                                                              │  │
│  │  Called by Token-2022 on every transfer:                     │  │
│  │   • Reads sender BlacklistEntry PDA → reject if present      │  │
│  │   • Reads receiver BlacklistEntry PDA → reject if present    │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                    │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  Token-2022 Program (spl-token-2022)                         │  │
│  │  TokenzQdBNbLqP5VEhdkAS6EPGA1WymbbVQnDBtzdeyz               │  │
│  │                                                              │  │
│  │  Mint extensions:                                            │  │
│  │   SSS-1: MintCloseAuthority, MetadataPointer                 │  │
│  │   SSS-2: + PermanentDelegate, TransferHook                   │  │
│  └──────────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────────┘
```

---

## Program Structure

### Main Program (`programs/solana-stablecoin-standard`)

```
src/
├── lib.rs            — Program entry point, instruction dispatch
├── constants.rs      — PDA seeds, limits (MAX_NAME_LEN=32, MAX_SYMBOL_LEN=10, MAX_URI_LEN=200)
├── error.rs          — SssError enum (14 error codes)
├── state.rs          — Account structs: StablecoinConfig, RolesConfig, BlacklistEntry, AuditLogEntry
└── instructions/
    ├── mod.rs
    ├── initialize.rs     — Create config + roles PDAs
    ├── mint_tokens.rs    — Role-gated mint with quota enforcement
    ├── burn_tokens.rs    — Role-gated burn
    ├── freeze_thaw.rs    — Individual account freeze/thaw
    ├── pause.rs          — Global pause/unpause flag
    ├── blacklist.rs      — Blacklist PDA init/close (SSS-2)
    ├── seize.rs          — Permanent delegate transfer (SSS-2)
    └── update_roles.rs   — Role updates + authority transfer
```

### Transfer Hook Program (`programs/sss-transfer-hook`)

```
src/
└── lib.rs            — execute() + initialize_extra_account_meta_list()
```

---

## PDA Layout

All PDAs are owned by the SSS main program unless noted.

### StablecoinConfig

Seeds: `[b"stablecoin-config", mint.key()]`

| Field                      | Type    | Size | Description                              |
|----------------------------|---------|------|------------------------------------------|
| discriminator              | u64     | 8    | Anchor account discriminator             |
| mint                       | Pubkey  | 32   | Token-2022 mint address                  |
| preset                     | enum    | 1    | Sss1 / Sss2 / Custom                     |
| paused                     | bool    | 1    | Global pause flag                        |
| max_supply                 | u64     | 8    | 0 = unlimited                            |
| decimals                   | u8      | 1    | Token decimal places                     |
| permanent_delegate_enabled | bool    | 1    | SSS-2 feature flag                       |
| transfer_hook_enabled      | bool    | 1    | SSS-2 feature flag                       |
| bump                       | u8      | 1    | PDA bump seed                            |
| **Total**                  |         | **55** |                                        |

### RolesConfig

Seeds: `[b"roles-config", mint.key()]`

| Field              | Type   | Size | Description                              |
|--------------------|--------|------|------------------------------------------|
| discriminator      | u64    | 8    | Anchor account discriminator             |
| mint               | Pubkey | 32   | Owning mint                              |
| master_authority   | Pubkey | 32   | Superadmin — can do everything           |
| minter             | Pubkey | 32   | Authorized to call mint_tokens           |
| minter_quota       | u64    | 8    | Max mintable per epoch (0 = unlimited)   |
| minted_this_epoch  | u64    | 8    | Running total for quota enforcement      |
| burner             | Pubkey | 32   | Authorized to call burn_tokens           |
| blacklister        | Pubkey | 32   | Authorized for blacklist ops (SSS-2)     |
| pauser             | Pubkey | 32   | Authorized for pause/freeze ops          |
| seizer             | Pubkey | 32   | Authorized for seize (SSS-2)             |
| bump               | u8     | 1    | PDA bump seed                            |
| **Total**          |        | **249** |                                       |

### BlacklistEntry (SSS-2 only)

Seeds: `[b"blacklist", mint.key(), target.key()]`

| Field         | Type   | Size | Description                               |
|---------------|--------|------|-------------------------------------------|
| discriminator | u64    | 8    | Anchor account discriminator              |
| mint          | Pubkey | 32   | Owning mint                               |
| address       | Pubkey | 32   | The blacklisted wallet address            |
| added_at      | i64    | 8    | Unix timestamp of blacklisting            |
| added_by      | Pubkey | 32   | Authority who added the entry             |
| reason        | u8     | 1    | Reason code (0 = unspecified)             |
| bump          | u8     | 1    | PDA bump seed                             |
| **Total**     |        | **114** |                                        |

Removing from the blacklist **closes** this account and returns lamports to the blacklister.

### AuditLogEntry

Seeds: `[b"audit", mint.key(), index.to_le_bytes()]`

| Field         | Type        | Size | Description                            |
|---------------|-------------|------|----------------------------------------|
| discriminator | u64         | 8    | Anchor account discriminator           |
| mint          | Pubkey      | 32   | Owning mint                            |
| action        | AuditAction | 1    | Mint/Burn/Freeze/Thaw/Pause/…          |
| actor         | Pubkey      | 32   | Who performed the action               |
| target        | Pubkey      | 32   | Affected address                       |
| amount        | u64         | 8    | Token amount (0 where not applicable)  |
| timestamp     | i64         | 8    | Unix timestamp                         |
| bump          | u8          | 1    | PDA bump seed                          |
| **Total**     |             | **122** |                                     |

---

## Token-2022 Extensions

### SSS-1 Extensions

| Extension              | Purpose                                                    |
|------------------------|------------------------------------------------------------|
| `MintCloseAuthority`   | Allows the authority to close an empty mint account        |
| `MetadataPointer`      | Points the mint to an on-chain metadata account            |

### SSS-2 Additional Extensions

| Extension              | Purpose                                                    |
|------------------------|------------------------------------------------------------|
| `PermanentDelegate`    | Grants a designated address unconditional transfer rights  |
| `TransferHook`         | Calls the SSS hook program on every token transfer         |

Extensions must be initialized on the mint account **before** calling `initialize`. The SDK handles this automatically through `SssClient.initialize()`.

---

## SSS-1 vs SSS-2 Feature Comparison

| Feature                   | SSS-1 | SSS-2 |
|---------------------------|-------|-------|
| Mint with quota           | Yes   | Yes   |
| Burn                      | Yes   | Yes   |
| Individual account freeze | Yes   | Yes   |
| Global pause              | Yes   | Yes   |
| On-chain metadata         | Yes   | Yes   |
| Permanent delegate        | No    | Yes   |
| Transfer hook enforcement | No    | Yes   |
| Address blacklist         | No    | Yes   |
| Token seizure             | No    | Yes   |
| Blacklister role          | No    | Yes   |
| Seizer role               | No    | Yes   |

---

## Transfer Hook Architecture (SSS-2)

When `transfer_hook_enabled = true`, Token-2022 automatically calls the SSS hook program's `execute` instruction on every token transfer. The flow is:

```
User calls token transfer
        │
        ▼
Token-2022 Program
        │
        ├── Validates transfer accounts
        │
        └── CPIs to SSS Transfer Hook (2fwDqW...)
                │
                ├── Reads ExtraAccountMetaList PDA
                │    Seeds: [b"extra-account-metas", mint]
                │
                ├── Derives sender BlacklistEntry PDA
                │    Seeds: [b"blacklist", mint, source_owner]
                │    (owned by SSS main program)
                │
                ├── If sender PDA has data → REJECT (SenderBlacklisted)
                │
                ├── Derives receiver BlacklistEntry PDA
                │    Seeds: [b"blacklist", mint, dest_owner]
                │
                └── If receiver PDA has data → REJECT (ReceiverBlacklisted)
                        │
                        ▼
                   Transfer succeeds
```

The hook reads BlacklistEntry PDAs that are **owned by the main SSS program**. This cross-program account read (not a CPI) is possible because the hook has read access to any account passed to it. If the PDA does not exist (account is not blacklisted), `data_is_empty()` returns `true` and the transfer proceeds.

The ExtraAccountMetaList PDA tells Token-2022 exactly which additional accounts to inject into the hook's `execute` call for each transfer, making the blacklist check transparent to end users and wallets.

---

## Role-Based Access Control Matrix

| Instruction          | master_authority | minter | burner | pauser | blacklister | seizer |
|----------------------|:----------------:|:------:|:------:|:------:|:-----------:|:------:|
| `initialize`         | Owner (payer)    |        |        |        |             |        |
| `mint_tokens`        | Yes              | Yes    |        |        |             |        |
| `burn_tokens`        | Yes              |        | Yes    |        |             |        |
| `freeze_account`     | Yes              |        |        | Yes    |             |        |
| `thaw_account`       | Yes              |        |        | Yes    |             |        |
| `pause`              | Yes              |        |        | Yes    |             |        |
| `unpause`            | Yes              |        |        | Yes    |             |        |
| `add_to_blacklist`   | Yes              |        |        |        | Yes         |        |
| `remove_from_blacklist` | Yes           |        |        |        | Yes         |        |
| `seize`              | Yes              |        |        |        |             | Yes    |
| `update_roles`       | Yes              |        |        |        |             |        |
| `transfer_authority` | Yes (current)    |        |        |        |             |        |

Notes:
- `blacklister` and `seizer` roles are only meaningful on SSS-2 tokens. Attempting to use them on SSS-1 returns `Sss2NotEnabled`.
- All roles default to `master_authority` if not explicitly set during `initialize`.
- `update_roles` can change any role except `master_authority`; use `transfer_authority` to change the master.

---

## SDK / CLI / Backend Component Diagram

```
npm install @stbr/sss-sdk
        │
        ▼
┌─────────────────────────────────┐
│  @stbr/sss-sdk                  │
│                                 │
│  SolanaStablecoin (factory API) │
│   ├── .create(provider, params) │
│   ├── .load(provider, mint)     │
│   ├── .mint()                   │
│   ├── .burn()                   │
│   ├── .freeze() / .thaw()       │
│   ├── .pause() / .unpause()     │
│   ├── .compliance.*             │
│   │    ├── .blacklistAdd()      │
│   │    ├── .blacklistRemove()   │
│   │    ├── .isBlacklisted()     │
│   │    └── .seize()             │
│   ├── .updateRoles()            │
│   ├── .transferAuthority()      │
│   ├── .getConfig()              │
│   ├── .getRoles()               │
│   └── .getTotalSupply()         │
│                                 │
│  SssClient (low-level)          │
│   └── wraps Anchor Program RPC  │
│                                 │
│  PDA Utilities                  │
│   ├── findStablecoinConfigPda() │
│   ├── findRolesConfigPda()      │
│   └── findBlacklistEntryPda()   │
└─────────────────────────────────┘
        │
        ├── used by sss-token CLI
        │    └── commander commands
        │         wrapping SDK calls
        │
        └── used by backend/src/index.ts
             └── HTTP routes delegating
                  to SolanaStablecoin.*
```

---

## Error Reference

| Code | Name                      | Description                                    |
|------|---------------------------|------------------------------------------------|
| 6000 | `Unauthorized`            | Caller lacks required role                     |
| 6001 | `TransfersPaused`         | Global pause is active                         |
| 6002 | `Blacklisted`             | Address is on the blacklist                    |
| 6003 | `Sss2NotEnabled`          | Feature requires SSS-2 preset                  |
| 6004 | `MaxSupplyExceeded`       | Mint would exceed configured max supply        |
| 6005 | `MinterQuotaExceeded`     | Mint would exceed per-minter quota             |
| 6006 | `InvalidPreset`           | Preset value or metadata validation failed     |
| 6007 | `NoMintAuthority`         | Mint authority not set on Token-2022 mint      |
| 6008 | `NoFreezeAuthority`       | Freeze authority not set on Token-2022 mint    |
| 6009 | `TransferHookMismatch`    | Hook program ID does not match expected        |
| 6010 | `CannotRemoveLastAuthority` | Would leave system without an admin          |
| 6011 | `ZeroAmount`              | Amount parameter must be greater than zero     |
| 6012 | `InvalidDecimals`         | Decimals must be between 0 and 9               |

Transfer hook errors (program `2fwDqW…`):

| Code | Name                  | Description                                |
|------|-----------------------|--------------------------------------------|
| 6000 | `SenderBlacklisted`   | Transfer source owner is blacklisted       |
| 6001 | `ReceiverBlacklisted` | Transfer destination owner is blacklisted  |
