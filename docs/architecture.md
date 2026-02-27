# Architecture

This document describes the on-chain architecture of the Solana Stablecoin Standard (SSS), including program design, PDA schema, Token-2022 extension usage, role-based access control, the transfer hook mechanism, the seize flow, and GENIUS Act reserve attestation.

## System Overview

```
                          +------------------+
                          |   Token-2022     |
                          |   (SPL Token)    |
                          +--------+---------+
                                   |
                    Mint / Burn / Freeze / Thaw / Transfer
                                   |
              +--------------------+--------------------+
              |                                         |
    +---------+---------+                 +-------------+-------------+
    |    sss-token      |                 |   sss-transfer-hook       |
    |                   |                 |                           |
    | - initialize      |  on transfer    | - transfer_hook           |
    | - mint_tokens     | <-------------- |   (execute handler)       |
    | - burn_tokens     |                 | - initialize_extra_       |
    | - freeze_account  |  checks PDAs   |   account_meta_list       |
    | - thaw_account    | <-------------- |                           |
    | - pause / unpause |                 | Reads:                    |
    | - update_roles    |                 |  - StablecoinConfig PDA   |
    | - update_minter   |                 |  - BlacklistEntry PDAs    |
    | - transfer_auth.  |                 +---------------------------+
    | - blacklist_add   |
    | - blacklist_remove|
    | - seize           |
    | - attest_reserve  |
    +-------------------+

    Owns PDAs:                          Owns PDA:
    - StablecoinConfig                  - ExtraAccountMetaList
    - RoleRegistry
    - MinterInfo
    - BlacklistEntry
    - ReserveAttestation
    - AuditLogEntry
```

**sss-token** is the core program. It manages the stablecoin lifecycle: initialization, supply control, access management, compliance enforcement, and reserve attestation. All state PDAs are owned by this program.

**sss-transfer-hook** is a lightweight companion program activated only for SSS-2 presets. Token-2022 invokes it on every `transfer_checked` call to enforce blacklist restrictions. The hook program does not own any stablecoin state -- it reads PDAs owned by sss-token to make pass/fail decisions.

## PDA Schema

All PDAs are derived deterministically from their seed components. The PDA authority model ensures that only the owning program can modify each account.

### StablecoinConfig

The central configuration account for a stablecoin. Created during `initialize`. Serves as the **mint authority**, **freeze authority**, and (for SSS-2) **permanent delegate** of the Token-2022 mint.

| Field | Type | Description |
|-------|------|-------------|
| `bump` | `u8` | PDA bump seed |
| `mint` | `Pubkey` | The Token-2022 mint address |
| `master_authority` | `Pubkey` | Root admin wallet |
| `name` | `String` (max 32) | Token name |
| `symbol` | `String` (max 10) | Token symbol |
| `uri` | `String` (max 200) | Metadata URI |
| `decimals` | `u8` | Decimal places |
| `preset` | `StablecoinPreset` | SSS1, SSS2, SSS3, or Custom |
| `enable_permanent_delegate` | `bool` | Permanent delegate extension enabled |
| `enable_transfer_hook` | `bool` | Transfer hook extension enabled |
| `default_account_frozen` | `bool` | New token accounts start frozen |
| `enable_confidential_transfers` | `bool` | Confidential transfer extension enabled |
| `is_paused` | `bool` | Whether mint/burn operations are paused |
| `total_minted` | `u64` | Cumulative tokens minted |
| `total_burned` | `u64` | Cumulative tokens burned |
| `audit_log_index` | `u64` | Next audit log index |
| `reserve_attestation_index` | `u64` | Next reserve attestation index |
| `created_at` | `i64` | Unix timestamp of creation |
| `updated_at` | `i64` | Unix timestamp of last update |

**Seeds**: `["config", mint.key()]`

**Program**: sss-token

### RoleRegistry

Stores the current holders of each operational role. Created during `initialize` alongside the config.

| Field | Type | Description |
|-------|------|-------------|
| `bump` | `u8` | PDA bump seed |
| `config` | `Pubkey` | Parent StablecoinConfig PDA |
| `master_authority` | `Pubkey` | Root admin (mirrors config) |
| `pauser` | `Pubkey` | Pause/unpause operator |
| `blacklister` | `Pubkey` | Blacklist manager (SSS-2) |
| `seizer` | `Pubkey` | Asset seizure operator (SSS-2) |

**Seeds**: `["roles", config.key()]`

**Program**: sss-token

### MinterInfo

Per-minter configuration. Created or updated via `update_minter`. Each minter wallet has its own PDA with an individual quota and running total.

| Field | Type | Description |
|-------|------|-------------|
| `bump` | `u8` | PDA bump seed |
| `config` | `Pubkey` | Parent StablecoinConfig PDA |
| `minter` | `Pubkey` | Minter wallet address |
| `is_active` | `bool` | Whether this minter can mint |
| `mint_quota` | `u64` | Maximum allowed mint (0 = unlimited) |
| `total_minted` | `u64` | Running total minted by this minter |
| `created_at` | `i64` | Unix timestamp of creation |
| `last_mint_at` | `i64` | Unix timestamp of last mint |

**Seeds**: `["minter", config.key(), minter_wallet.key()]`

**Program**: sss-token

### BlacklistEntry

Per-address blacklist record. Created by `blacklist_add`, closed by `blacklist_remove`. The transfer hook program checks for the existence of these PDAs to block transfers.

| Field | Type | Description |
|-------|------|-------------|
| `bump` | `u8` | PDA bump seed |
| `config` | `Pubkey` | Parent StablecoinConfig PDA |
| `blocked_address` | `Pubkey` | The blacklisted wallet address |
| `reason` | `String` (max 128) | Reason for blacklisting |
| `blacklisted_by` | `Pubkey` | The authority who added the entry |
| `blacklisted_at` | `i64` | Unix timestamp |

**Seeds**: `["blacklist", config.key(), address.key()]`

**Program**: sss-token

### ReserveAttestation

Immutable record of a reserve proof attestation. Created by `attest_reserve`. Each attestation is assigned a sequential index.

| Field | Type | Description |
|-------|------|-------------|
| `bump` | `u8` | PDA bump seed |
| `config` | `Pubkey` | Parent StablecoinConfig PDA |
| `index` | `u64` | Sequential attestation index |
| `reserve_hash` | `[u8; 32]` | SHA-256 hash of the off-chain reserve proof |
| `total_reserves_usd` | `u64` | Total reserves in USD minor units (cents) |
| `total_outstanding` | `u64` | Total outstanding stablecoins |
| `attested_by` | `Pubkey` | The authority who submitted the attestation |
| `attestation_uri` | `String` (max 200) | URI to the full attestation report |
| `timestamp` | `i64` | Unix timestamp |

**Seeds**: `["reserve", config.key(), index.to_le_bytes()]`

**Program**: sss-token

### AuditLogEntry

Append-only audit trail. Created on each significant operation (mint, burn, freeze, thaw, pause, etc.).

| Field | Type | Description |
|-------|------|-------------|
| `bump` | `u8` | PDA bump seed |
| `config` | `Pubkey` | Parent StablecoinConfig PDA |
| `index` | `u64` | Sequential log index |
| `action` | `AuditAction` | Enum: Mint, Burn, Freeze, Thaw, Pause, Unpause, BlacklistAdd, BlacklistRemove, Seize, RoleUpdate, MinterUpdate, AuthorityTransfer, ReserveAttestation |
| `actor` | `Pubkey` | Who performed the action |
| `target` | `Option<Pubkey>` | Target address (if applicable) |
| `amount` | `Option<u64>` | Amount (if applicable) |
| `details` | `String` (max 256) | Human-readable details |
| `timestamp` | `i64` | Unix timestamp |

**Seeds**: `["audit", config.key(), index.to_le_bytes()]`

**Program**: sss-token

### ExtraAccountMetaList

Token-2022 transfer hook resolution account. Tells Token-2022 which additional accounts to pass when invoking the transfer hook.

**Seeds**: `["extra-account-metas", mint.key()]`

**Program**: sss-transfer-hook

**Contents** (4 extra accounts):

| Index | Account | Derivation | Purpose |
|-------|---------|-----------|---------|
| 5 | sss-token program | Literal pubkey | Needed for PDA derivation of config and blacklist |
| 6 | StablecoinConfig PDA | External PDA: sss-token `["config", mint]` | Checked in the hook to identify program-initiated transfers |
| 7 | Source BlacklistEntry PDA | External PDA: sss-token `["blacklist", config, authority]` | Checked for source blacklist status |
| 8 | Dest BlacklistEntry PDA | External PDA: sss-token `["blacklist", config, dest_owner]` | Checked for destination blacklist status; dest_owner extracted from token account data at offset 32 |

## Token-2022 Extensions

SSS uses the following Token-2022 extensions, activated at mint initialization based on the selected preset:

### MetadataPointer (All presets)

Points to the mint account itself as the metadata source. Token name, symbol, and URI are stored in the StablecoinConfig PDA and referenced via the metadata pointer.

### PermanentDelegate (SSS-2, SSS-3)

Sets the StablecoinConfig PDA as the permanent delegate of the mint. This allows the program to burn tokens from any token account during seizure operations, without requiring the token holder's signature.

### TransferHook (SSS-2)

Registers the `sss-transfer-hook` program as the transfer hook for the mint. Token-2022 calls the hook's `transfer_hook` instruction on every `transfer_checked` call, passing the resolved extra accounts from the ExtraAccountMetaList.

### DefaultAccountState (SSS-2)

Can be configured to set the default state of new token accounts to `frozen`. When enabled, new token accounts must be explicitly thawed before they can receive or send tokens. This is useful for regulated environments requiring KYC approval before account activation.

### ConfidentialTransferMint (SSS-3)

Enables confidential (zero-knowledge proof) transfers on the mint. Transaction amounts are encrypted while the transfer hook or permanent delegate can still enforce compliance. This extension is planned for SSS-3 and is not yet fully implemented.

## Role-Based Access Control

The access control model is enforced by the `require_role`, `require_master_authority`, `require_not_paused`, and `require_paused` utility functions in the sss-token program.

```
                    Master Authority
                    /       |       \
                   /        |        \
              Pauser   Blacklister   Seizer
                           |
                      (creates/removes
                       BlacklistEntry)

              Minters (independent, managed by Master Authority)
```

### Role Resolution

- **Master Authority**: Stored in both `StablecoinConfig.master_authority` and `RoleRegistry.master_authority`. Has implicit access to all roles.
- **Pauser**: `RoleRegistry.pauser`. Can pause and unpause. Master authority can also pause/unpause.
- **Blacklister**: `RoleRegistry.blacklister`. Can add/remove blacklist entries. Master authority can also blacklist. SSS-2 only.
- **Seizer**: `RoleRegistry.seizer`. Can seize tokens from blacklisted addresses. Master authority can also seize. SSS-2 only.
- **Minters**: Each minter has a separate `MinterInfo` PDA. Minters are not stored in the RoleRegistry; they are managed independently via `update_minter`. A minter can only mint if `is_active == true` and `amount <= remaining_quota`.

### Authority Transfer

The `transfer_authority` instruction transfers the master authority to a new address. This updates both `StablecoinConfig.master_authority` and `RoleRegistry.master_authority` atomically. The old authority must sign the transaction.

## Transfer Hook Flow (SSS-2)

When a user calls `transfer_checked` on a Token-2022 mint with the TransferHook extension, the following flow executes:

```
User calls transfer_checked on Token-2022
          |
          v
Token-2022 resolves ExtraAccountMetaList PDA
          |
          v
Token-2022 derives extra accounts:
  [5] sss-token program (literal)
  [6] StablecoinConfig PDA (external PDA from sss-token)
  [7] Source BlacklistEntry PDA (external PDA from sss-token)
  [8] Dest BlacklistEntry PDA (external PDA from sss-token)
          |
          v
Token-2022 invokes sss-transfer-hook::transfer_hook
via spl-transfer-hook-interface discriminator
          |
          v
sss-transfer-hook fallback handler routes to transfer_hook
          |
          v
Hook checks: Is authority == config PDA?
  YES --> Allow (program-initiated transfer, e.g., seize)
  NO  --> Continue checks
          |
          v
Hook checks: Does source BlacklistEntry PDA exist
             and is owned by sss-token?
  YES --> REJECT (SourceBlacklisted)
  NO  --> Continue
          |
          v
Hook checks: Does dest BlacklistEntry PDA exist
             and is owned by sss-token?
  YES --> REJECT (DestinationBlacklisted)
  NO  --> ALLOW transfer
```

The hook uses PDA existence checks rather than account data parsing. If the BlacklistEntry PDA for an address exists (is initialized, has data, and is owned by sss-token), that address is blacklisted. If the PDA does not exist or has no data, the address is not blacklisted.

The destination owner's public key is extracted from the destination token account's on-chain data at byte offset 32 (the `owner` field in the SPL Token account layout), using `Seed::AccountData { account_index: 2, data_index: 32, length: 32 }`.

## Seize Mechanism (SSS-2)

Seize cannot use `transfer_checked` because that would trigger the transfer hook, which would reject the transfer (the source is blacklisted). Instead, seize uses a **burn+mint** pattern:

```
Seizer calls sss-token::seize
          |
          v
Verify: seizer role, target is blacklisted, not paused
          |
          v
Step 1: Burn `amount` from blacklisted account
        (Config PDA signs as permanent delegate + mint authority)
          |
          v
Step 2: Mint `amount` to treasury account
        (Config PDA signs as mint authority)
          |
          v
Emit TokensSeized event
```

This approach:
- Bypasses the transfer hook entirely (no `transfer_checked` call)
- Uses the permanent delegate authority to burn from any account
- Maintains accurate `total_minted` and `total_burned` counters (burn increments `total_burned`, mint increments `total_minted`, so the net supply remains unchanged)

## Blacklist Lifecycle

```
blacklist_add:
  1. Create BlacklistEntry PDA
  2. Freeze target's token account via Token-2022
  3. Emit BlacklistAdded event

  Result: Target cannot send or receive tokens.
          Transfer hook rejects transfers involving this address.
          Token account is frozen as an additional safeguard.

blacklist_remove:
  1. Close BlacklistEntry PDA (return rent to authority)
  2. Thaw target's token account via Token-2022
  3. Emit BlacklistRemoved event

  Result: Target can transact normally again.
```

## GENIUS Act Reserve Attestation

The GENIUS Act (Guiding and Establishing National Innovation for U.S. Stablecoins) requires stablecoin issuers to maintain and attest to sufficient reserves backing outstanding tokens. SSS implements this with the `attest_reserve` instruction:

1. The master authority submits an attestation containing:
   - A SHA-256 hash of the off-chain reserve proof document
   - Total reserves in USD (minor units/cents)
   - Total outstanding stablecoins
   - A URI pointing to the full audit report
2. The program creates an immutable `ReserveAttestation` PDA with a sequential index
3. The `reserve_attestation_index` in the config is incremented
4. Anyone can verify the attestation on-chain by:
   - Fetching the ReserveAttestation PDA by index
   - Comparing the `reserve_hash` to their own hash of the off-chain document
   - Verifying the `attested_by` address
   - Checking `total_reserves_usd >= total_outstanding` for adequate collateralization

## Feature Gating

Instructions that require specific presets are gated at runtime using the feature gate utility functions:

- `require_blacklist_enabled(config)`: Checks `enable_permanent_delegate && enable_transfer_hook`. Required for `blacklist_add`, `blacklist_remove`, and `seize`.
- `require_transfer_hook_enabled(config)`: Checks `enable_transfer_hook`. Required for transfer hook initialization.
- `require_confidential_transfers_enabled(config)`: Checks `enable_confidential_transfers`. Required for SSS-3 features.

These flags are set at initialization time based on the chosen preset and are immutable thereafter.

## Error Codes

| Code | Name | Description |
|------|------|-------------|
| 6000 | Unauthorized | Caller does not have the required role |
| 6001 | InvalidAuthority | Invalid authority for this operation |
| 6002 | ProgramPaused | Program is currently paused |
| 6003 | ProgramNotPaused | Program is not paused |
| 6004 | MinterNotActive | Minter is not active |
| 6005 | MintQuotaExceeded | Mint amount exceeds minter quota |
| 6006 | MintAmountZero | Mint amount must be greater than zero |
| 6007 | BurnAmountZero | Burn amount must be greater than zero |
| 6008 | InsufficientBalance | Insufficient balance for burn |
| 6009 | FeatureNotEnabled | Feature not enabled for this preset |
| 6010 | BlacklistNotEnabled | Blacklist requires SSS-2 or higher |
| 6011 | TransferHookNotEnabled | Transfer hook requires SSS-2 or higher |
| 6012 | ConfidentialTransfersNotEnabled | Confidential transfers require SSS-3 |
| 6013 | AlreadyBlacklisted | Address is already blacklisted |
| 6014 | NotBlacklisted | Address is not blacklisted |
| 6015 | CannotBlacklistAuthority | Cannot blacklist the master authority |
| 6016 | NameTooLong | Name exceeds 32 characters |
| 6017 | SymbolTooLong | Symbol exceeds 10 characters |
| 6018 | UriTooLong | URI exceeds 200 characters |
| 6019 | ReasonTooLong | Reason exceeds 128 characters |
| 6020 | DetailsTooLong | Details exceeds 256 characters |
| 6021 | InvalidDecimals | Invalid decimals value |
| 6022 | SameAuthority | Cannot transfer authority to the same address |
| 6023 | ZeroAuthority | New authority cannot be the zero address |
| 6024 | Overflow | Arithmetic overflow |

The transfer hook program defines two additional error codes:

| Code | Name | Description |
|------|------|-------------|
| 6000 | SourceBlacklisted | Source address is blacklisted |
| 6001 | DestinationBlacklisted | Destination address is blacklisted |
