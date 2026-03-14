# Architecture

This document describes the internal design of the Solana Stablecoin Standard (SSS). It covers the layer model, on-chain account structures, PDA derivation, Token-2022 extension usage, the transfer hook design, and the security model.

## Table of Contents

- [Layer Model](#layer-model)
- [On-Chain Programs](#on-chain-programs)
- [Account Structures](#account-structures)
- [PDA Derivation](#pda-derivation)
- [Token-2022 Extensions](#token-2022-extensions)
- [Transfer Hook Design](#transfer-hook-design)
- [Security Model](#security-model)
- [Event System](#event-system)

---

## Layer Model

SSS is organized into four layers. Each higher layer builds on the one below.

```
+---------------------------------------------------+
|  CLI / Frontend                                    |
|  sss-token commands, web dashboards               |
+---------------------------------------------------+
|  SDK                                               |
|  SolanaStablecoin, ComplianceApi, RolesApi         |
+---------------------------------------------------+
|  Modules (Rust crates)                             |
|  sss-compliance (shared types, validation)         |
|  sss-privacy (reserved for future use)             |
+---------------------------------------------------+
|  On-Chain Programs                                 |
|  sss-core (issuer logic)                           |
|  sss-transfer-hook (transfer enforcement)          |
+---------------------------------------------------+
|  Solana Runtime + Token-2022                       |
+---------------------------------------------------+
```

**Presets** are named configurations that select which Token-2022 extensions to enable at mint creation time:

| Preset | Extensions | Use Case |
|--------|-----------|----------|
| SSS-1  | MetadataPointer, TokenMetadata | Minimal stablecoin, no compliance overhead |
| SSS-2  | MetadataPointer, TokenMetadata, PermanentDelegate, TransferHook, DefaultAccountState(Frozen) | Regulated stablecoin with blacklist, seizure, KYC gating |
| SSS-3  | MetadataPointer, TokenMetadata, Allowlist enforcement | Permissioned stablecoin with allowlist (KYC whitelist) |

---

## On-Chain Programs

### sss-core

| Property | Value |
|----------|-------|
| Program ID | `G3jadBDzaF2HbTY2at5auYYQQ94zhhWaocMuWDgUy2vL` |
| Framework | Anchor 0.31.1 |
| Token standard | SPL Token-2022 (spl-token-2022 6.0.0) |

Implements 22 instructions:

| # | Instruction | Access Control | Paused Check |
|---|-------------|---------------|--------------|
| 1 | `initialize` | Authority (signer) | -- |
| 2 | `mint_tokens` | Minter role + Quota | Yes |
| 3 | `burn_tokens` | Any token holder | Yes |
| 4 | `freeze_account` | Freezer role | Yes |
| 5 | `thaw_account` | Freezer role | Yes |
| 6 | `pause` | Authority | No (checks not-paused) |
| 7 | `unpause` | Authority | No (checks paused) |
| 8 | `propose_authority` | Authority | No |
| 9 | `accept_authority` | Pending authority | No |
| 10 | `cancel_authority_transfer` | Authority | No |
| 11 | `transfer_authority` | Both signers | No |
| 12 | `grant_role` | Authority | No |
| 13 | `revoke_role` | Authority | No |
| 14 | `set_quota` | Authority | No |
| 15 | `add_to_blacklist` | Blacklister role | No (SSS-2 only) |
| 16 | `remove_from_blacklist` | Blacklister role | No (SSS-2 only) |
| 17 | `seize` | Seizer role | Yes (SSS-2 only) |
| 18 | `set_metadata` | Authority | No |
| 19 | `set_supply_cap` | Authority | No |
| 20 | `add_to_allowlist` | Authority | No (SSS-3 only) |
| 21 | `remove_from_allowlist` | Authority | No (SSS-3 only) |
| 22 | `configure_oracle` | Authority | No |

### sss-transfer-hook

| Property | Value |
|----------|-------|
| Program ID | `EAzHNW2cjpYdBjLBJ9RVLoGryXQJE98dpHTdyPiE6389` |
| Framework | Anchor 0.31.1 |
| Interface | SPL Transfer Hook Interface 0.10.0 |

Implements 2 instructions:

| Instruction | Purpose |
|-------------|---------|
| `initialize_extra_account_meta_list` | Write the ExtraAccountMetaList PDA for a mint |
| `execute` / `fallback` | Enforce blacklist + pause + allowlist on every transfer |

---

## Account Structures

### StablecoinConfig

**Seeds:** `["config", mint.key()]`

| Field | Type | Size | Offset | Description |
|-------|------|------|--------|-------------|
| (discriminator) | `[u8; 8]` | 8 | 0 | Anchor account discriminator |
| authority | `Pubkey` | 32 | 8 | Current authority |
| pending_authority | `Pubkey` | 32 | 40 | Pending authority (zero = none) |
| mint | `Pubkey` | 32 | 72 | Token-2022 mint address |
| transfer_hook_program | `Pubkey` | 32 | 104 | Hook program ID (zero if SSS-1) |
| paused | `bool` | 1 | 136 | Global pause flag |
| compliance_enabled | `bool` | 1 | 137 | SSS-2 features active |
| total_minted | `u64` | 8 | 138 | Lifetime minted amount |
| total_burned | `u64` | 8 | 146 | Lifetime burned amount |
| supply_cap | `u64` | 8 | 154 | Maximum supply cap (0 = unlimited) |
| enable_allowlist | `bool` | 1 | 162 | Whether SSS-3 allowlist mode is enabled |
| bump | `u8` | 1 | 163 | PDA bump seed |
| _reserved | `[u8; 23]` | 23 | 164 | Reserved for upgrades |
| **Total** | | **187** | | 8 + 32 + 32 + 32 + 32 + 1 + 1 + 8 + 8 + 8 + 1 + 1 + 23 |

Net supply at any point: `total_minted - total_burned`.

### RoleAssignment

**Seeds:** `["role", config.key(), [role_byte], holder.key()]`

| Field | Type | Size | Offset | Description |
|-------|------|------|--------|-------------|
| (discriminator) | `[u8; 8]` | 8 | 0 | Anchor account discriminator |
| config | `Pubkey` | 32 | 8 | Associated StablecoinConfig |
| holder | `Pubkey` | 32 | 40 | Address that holds the role |
| role | `u8` | 1 | 72 | Role byte (0-5) |
| active | `bool` | 1 | 73 | Whether this role is currently active |
| granted_by | `Pubkey` | 32 | 74 | Who granted this role |
| granted_at | `i64` | 8 | 106 | When this role was granted (unix timestamp) |
| bump | `u8` | 1 | 114 | PDA bump seed |
| _reserved | `[u8; 16]` | 16 | 115 | Reserved for upgrades |
| **Total** | | **131** | | 8 + 32 + 32 + 1 + 1 + 32 + 8 + 1 + 16 |

Roles are deactivated (active=false) on revoke rather than closing the PDA, maintaining an audit trail.

### MinterQuota

**Seeds:** `["quota", config.key(), minter.key()]`

| Field | Type | Size | Offset | Description |
|-------|------|------|--------|-------------|
| (discriminator) | `[u8; 8]` | 8 | 0 | Anchor account discriminator |
| config | `Pubkey` | 32 | 8 | Associated StablecoinConfig |
| minter | `Pubkey` | 32 | 40 | Minter address |
| quota_limit | `u64` | 8 | 72 | Maximum mint amount (u64::MAX = unlimited) |
| minted_amount | `u64` | 8 | 80 | Amount minted so far |
| bump | `u8` | 1 | 88 | PDA bump seed |
| _reserved | `[u8; 32]` | 32 | 89 | Reserved for upgrades |
| **Total** | | **121** | | 8 + 32 + 32 + 8 + 8 + 1 + 32 |

### BlacklistEntry

**Seeds:** `["blacklist", config.key(), address.key()]`

| Field | Type | Size | Offset | Description |
|-------|------|------|--------|-------------|
| (discriminator) | `[u8; 8]` | 8 | 0 | Anchor account discriminator |
| config | `Pubkey` | 32 | 8 | Associated StablecoinConfig |
| address | `Pubkey` | 32 | 40 | Blacklisted address |
| reason | `String` | 4 + 128 | 72 | Reason for blacklisting (max 128 chars) |
| blacklisted_at | `i64` | 8 | 204 | When the address was blacklisted (unix timestamp) |
| blacklisted_by | `Pubkey` | 32 | 212 | Who blacklisted this address |
| active | `bool` | 1 | 244 | Whether this blacklist entry is currently active |
| bump | `u8` | 1 | 245 | PDA bump seed |
| _reserved | `[u8; 16]` | 16 | 246 | Reserved for upgrades |
| **Total** | | **262** | | 8 + 32 + 32 + 132 + 8 + 32 + 1 + 1 + 16 |

Blacklist entries are deactivated (active=false) rather than closed, preserving a full audit trail. The transfer hook checks both PDA existence and ownership.

### AllowlistEntry

**Seeds:** `["allowlist", config.key(), address.key()]`

| Field | Type | Size | Offset | Description |
|-------|------|------|--------|-------------|
| (discriminator) | `[u8; 8]` | 8 | 0 | Anchor account discriminator |
| config | `Pubkey` | 32 | 8 | Associated StablecoinConfig |
| address | `Pubkey` | 32 | 40 | The allowlisted wallet address |
| added_at | `i64` | 8 | 72 | When the address was added (unix timestamp) |
| added_by | `Pubkey` | 32 | 80 | Who added this address |
| bump | `u8` | 1 | 112 | PDA bump seed |
| **Total** | | **113** | | 8 + 32 + 32 + 8 + 32 + 1 |

Unlike blacklist entries, allowlist entries are closed (deleted) on removal, returning rent to the authority.

### ExtraAccountMetaList (Transfer Hook)

**Seeds:** `["extra-account-metas", mint.key()]` (under the transfer hook program)

This is an SPL standard account managed by `spl-tlv-account-resolution`. It stores a list of `ExtraAccountMeta` entries that tell Token-2022 which additional accounts to pass to the hook's `execute` instruction.

---

## PDA Derivation

All PDAs are derived using `Pubkey::find_program_address` (Rust) or `PublicKey.findProgramAddressSync` (TypeScript).

### sss-core PDAs

| Account | Seeds | Program |
|---------|-------|---------|
| StablecoinConfig | `[b"config", mint.key()]` | sss-core |
| RoleAssignment | `[b"role", config.key(), [role_byte], holder.key()]` | sss-core |
| MinterQuota | `[b"quota", config.key(), minter.key()]` | sss-core |
| BlacklistEntry | `[b"blacklist", config.key(), address.key()]` | sss-core |
| AllowlistEntry | `[b"allowlist", config.key(), address.key()]` | sss-core |

### sss-transfer-hook PDAs

| Account | Seeds | Program |
|---------|-------|---------|
| ExtraAccountMetaList | `[b"extra-account-metas", mint.key()]` | sss-transfer-hook |

### TypeScript Helpers

```typescript
import {
  getConfigAddress,
  getRoleAddress,
  getQuotaAddress,
  getBlacklistAddress,
  getAllowlistAddress,
  getExtraAccountMetasAddress,
} from "@sss/core";

const [config, bump] = getConfigAddress(programId, mint);
const [role]         = getRoleAddress(programId, ROLE_MINTER, holder);
const [quota]        = getQuotaAddress(programId, config, minter);
const [blacklist]    = getBlacklistAddress(programId, config, address);
const [allowlist]    = getAllowlistAddress(programId, config, address);
const [extraMetas]   = getExtraAccountMetasAddress(hookProgramId, mint);
```

---

## Token-2022 Extensions

SSS uses the following Token-2022 extensions, configured at mint initialization and immutable after that.

### MetadataPointer (SSS-1 + SSS-2)

Points the mint to itself as the metadata account. The metadata update authority is the config PDA.

```
MetadataPointer {
    authority: Some(config_pda),
    metadata_address: Some(mint),
}
```

### TokenMetadata (SSS-1 + SSS-2)

Token metadata (name, symbol, URI, additional fields) is stored directly on the mint account. Updated via `spl_token_metadata_interface::instruction::update_field`.

### PermanentDelegate (SSS-2 only)

The config PDA is the permanent delegate. This allows the program to burn tokens from any account without the holder's signature -- required for asset seizure.

```
PermanentDelegate {
    delegate: config_pda,
}
```

### TransferHook (SSS-2 only)

Every transfer triggers a CPI to the transfer hook program. The hook authority is the config PDA.

```
TransferHook {
    authority: Some(config_pda),
    program_id: Some(sss_transfer_hook_program_id),
}
```

### DefaultAccountState (SSS-2 only)

All new token accounts are created in a frozen state. Accounts must be explicitly thawed (by a freezer) before they can send or receive tokens. This enables KYC gating: only thaw accounts that have passed KYC.

```
DefaultAccountState {
    state: AccountState::Frozen,
}
```

### Extension Initialization Order

Extensions must be initialized **before** `initialize_mint2`. The order in `initialize.rs`:

1. `MetadataPointer` -- always
2. `PermanentDelegate` -- if compliance_enabled
3. `TransferHook` -- if compliance_enabled
4. `DefaultAccountState` -- if compliance_enabled
5. `initialize_mint2` -- sets mint authority + freeze authority to config PDA
6. `TokenMetadata initialize` -- writes name/symbol/uri (requires mint authority signature)

---

## Transfer Hook Design

The transfer hook is the enforcement layer for SSS-2 compliance. It runs on every Token-2022 transfer.

### ExtraAccountMetaList Setup

The `initialize_extra_account_meta_list` instruction writes four extra account entries:

```
Account indices in execute():
  [0] source token account
  [1] mint
  [2] destination token account
  [3] owner (authority/source owner)
  [4] extra_account_metas PDA
  [5] config PDA           (extra[0])
  [6] sender blacklist PDA  (extra[1])
  [7] receiver blacklist PDA (extra[2])
  [8] sss-core program      (extra[3])
```

| Extra Index | Resolution | Details |
|------------|-----------|---------|
| 0 (index 5) | External PDA under sss-core | Seeds: `[b"config", AccountKey{1}]` -- derives config from mint |
| 1 (index 6) | External PDA under sss-core | Seeds: `[b"blacklist", AccountKey{5}, AccountData{0, 32, 32}]` -- derives sender blacklist from config + source token account owner |
| 2 (index 7) | External PDA under sss-core | Seeds: `[b"blacklist", AccountKey{5}, AccountData{2, 32, 32}]` -- derives receiver blacklist from config + dest token account owner |
| 3 (index 8) | Literal pubkey | sss-core program ID |

### Seed::AccountData for Owner Extraction

The blacklist PDA seeds require the *wallet owner* of the token account, not the token account address itself. Token-2022 only passes token account addresses to the hook. The solution:

```rust
Seed::AccountData {
    account_index: 0,   // source token account
    data_index: 32,     // owner field offset in SPL Token account layout
    length: 32,         // pubkey size
}
```

The SPL Token account layout places the owner pubkey at bytes 32-63. `Seed::AccountData` reads those 32 bytes at runtime to derive the blacklist PDA.

### Fail-Closed Logic

The transfer hook is fail-closed: if it cannot verify the transfer is safe, it blocks.

```rust
// If config is unreadable, block the transfer
if *config_info.owner == SSS_CORE_PROGRAM_ID && !config_info.data_is_empty() {
    // Read pause flag at offset 136
    let data = config_info.try_borrow_data()?;
    if data[CONFIG_PAUSED_OFFSET] == 1 {
        return Err(TransferHookError::StablecoinPaused.into());
    }
} else {
    // Fail-closed: config not readable
    return Err(TransferHookError::InvalidConfig.into());
}
```

The pause flag is read directly from the raw account data at byte offset 136 (8 discriminator + 32 authority + 32 pending_authority + 32 mint + 32 transfer_hook_program = 136).

### Dual-Entry Pattern

Token-2022 calls hooks using the SPL Transfer Hook Interface discriminator, not Anchor's 8-byte discriminator. SSS implements both:

1. **`execute()`** -- Anchor-native entry point. Uses Anchor's discriminator. Useful for direct calls and testing.
2. **`fallback()`** -- Catches all unrecognized instructions. Verifies the SPL `ExecuteInstruction` discriminator, then parses the raw account array and calls the same shared `execute_checks()` function.

```
Token-2022 transfer
  -> CPI to transfer hook with SPL discriminator
  -> Anchor's entrypoint does not match any instruction
  -> fallback() catches it
  -> Validates SPL discriminator
  -> Calls execute_checks(config, sender_bl, receiver_bl)
```

### Blacklist Check Logic

```rust
// If PDA exists and is owned by sss-core, the address is blacklisted
if *sender_blacklist.owner == SSS_CORE_PROGRAM_ID
    && !sender_blacklist.data_is_empty()
{
    return Err(TransferHookError::SenderBlacklisted.into());
}
```

If the blacklist PDA does not exist (data is empty or owner is system program), the address is NOT blacklisted. This is a zero-cost check for non-blacklisted users.

---

## Security Model

### Role-Based Access Control

Six roles with ascending privilege:

| Role | Byte | Capabilities |
|------|------|-------------|
| Admin | 0 | Reserved (unused by instructions currently) |
| Minter | 1 | `mint_tokens` (with quota enforcement) |
| Pauser | 2 | Reserved for future per-role pause |
| Freezer | 3 | `freeze_account`, `thaw_account` |
| Blacklister | 4 | `add_to_blacklist`, `remove_from_blacklist` (SSS-2) |
| Seizer | 5 | `seize` (SSS-2) |

SSS-2 roles (Blacklister, Seizer) can only be granted when `compliance_enabled = true`.

Roles are granted and revoked by the authority. Role existence is tracked by PDA existence: `init` on grant, `close` on revoke. Rent from closed accounts is returned to the authority.

### Pause Enforcement

When `config.paused == true`:

- `mint_tokens` -- blocked (Anchor constraint)
- `burn_tokens` -- blocked (Anchor constraint)
- `freeze_account` / `thaw_account` -- blocked (Anchor constraint)
- `seize` -- blocked (Anchor constraint)
- All Token-2022 transfers -- blocked (transfer hook reads raw byte at offset 136)

Admin operations (`pause`, `unpause`, `propose_authority`, `accept_authority`, `grant_role`, `revoke_role`, `set_quota`, `add_to_blacklist`, `remove_from_blacklist`, `set_metadata`) remain available during pause.

### Two-Step Authority Transfer

Authority transfer uses a propose-accept pattern to prevent accidental loss:

```
1. Current authority calls propose_authority(new_authority)
   -> config.pending_authority = new_authority

2. New authority calls accept_authority()
   -> config.authority = config.pending_authority
   -> config.pending_authority = Pubkey::default()
   -> Emits AuthorityTransferred event

3. (Optional) Current authority can cancel:
   -> cancel_authority_transfer()
   -> config.pending_authority = Pubkey::default()
```

### Quota Enforcement

Minters have per-address quotas tracked by the MinterQuota PDA:

- `quota_limit` -- maximum total amount this minter can ever mint
- `minted_amount` -- how much has been minted so far
- Checked on every `mint_tokens` call: `minted_amount + amount <= quota_limit`
- `u64::MAX` (18,446,744,073,709,551,615) means unlimited
- Quotas are set by the authority via `set_quota`
- The quota account is `init_if_needed`, so updating a quota does not reset `minted_amount`

### Compliance Gating

SSS-2 instructions (`add_to_blacklist`, `remove_from_blacklist`, `seize`) require `config.compliance_enabled == true`. Attempting to use them on an SSS-1 mint returns `ComplianceNotEnabled`.

---

## Event System

All state-changing operations emit Anchor events for off-chain indexing:

| Event | Emitted By |
|-------|-----------|
| `StablecoinInitialized` | `initialize` |
| `TokensMinted` | `mint_tokens` |
| `TokensBurned` | `burn_tokens` |
| `AccountFrozen` | `freeze_account` |
| `AccountThawed` | `thaw_account` |
| `StablecoinPaused` | `pause` |
| `StablecoinUnpaused` | `unpause` |
| `AuthorityTransferred` | `accept_authority` |
| `RoleGranted` | `grant_role` |
| `RoleRevoked` | `revoke_role` |
| `QuotaSet` | `set_quota` |
| `AddressBlacklisted` | `add_to_blacklist` |
| `AddressUnblacklisted` | `remove_from_blacklist` |
| `TokensSeized` | `seize` |
| `AllowlistAdded` | `add_to_allowlist` |
| `AllowlistRemoved` | `remove_from_allowlist` |

Events are stored in transaction logs and can be parsed by the backend indexer service or any Solana event listener.
