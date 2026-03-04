# SSS-1: Minimal Stablecoin Standard

## Overview

SSS-1 is the minimal stablecoin standard for Solana. It provides the core capabilities needed to issue and manage a stablecoin — minting, burning, freezing, and metadata — without the compliance overhead of on-chain blacklisting or token seizure.

SSS-1 is suitable for DAO treasury tokens, internal settlement tokens, and ecosystem stablecoins that do not face direct regulatory obligations requiring sanctions screening or court-ordered seizure.

An SSS-1 mint is initialized with `enable_permanent_delegate = false` and `enable_transfer_hook = false`. These flags are immutable after initialization. SSS-2 compliance instructions (`add_to_blacklist`, `remove_from_blacklist`, `seize`) return `Sss2NotEnabled` when called against an SSS-1 mint.

---

## Token-2022 Extensions

### MetadataPointer (required)

Points to the mint itself. Token metadata (name, symbol, URI) is stored directly in the mint account using the SPL Token Metadata Interface. This eliminates the need for a separate metadata account and makes metadata readable via the standard `getMint` + extension parsing flow.

The metadata update authority is set to the operator's wallet at initialization time. Metadata can be updated without touching the stablecoin config.

### FreezeAuthority (required)

The freeze authority is set to the **config PDA**, not to any human key. This means freeze and thaw operations must go through the `sss_token` program's access control checks. Direct Token-2022 `FreezeAccount` instructions signed by an operator key are not permitted — the operator key has no freeze authority.

---

## Roles

All roles are scoped per mint. A role granted on mint A has no effect on mint B.

### Master Authority

The `config.authority` field. Set at initialization to the deploying wallet. Holds full control over all privileged operations for the mint:

- Mint tokens (no quota)
- Burn tokens
- Freeze / thaw accounts
- Pause / unpause the program
- Add / remove minters
- Add / remove compliance roles
- Nominate a new authority

The master authority is a single key. Operators should use a multisig (e.g., Squads) as the authority key in production.

### Minter

Granted via `add_minter`. Allows the holder to call `mint_to` for this mint up to a configured quota.

- `quota = 0` means unlimited minting capacity.
- `quota > 0` enforces a cumulative ceiling. The `minted` counter is incremented on each mint and cannot be reset.
- Minters cannot exceed their quota in a single transaction or across multiple transactions.
- Deactivated via `remove_minter` (sets `active = false`; the PDA record is preserved).

### Freezer

Granted via `add_role` with `role = Freezer`. Allows the holder to call `freeze_account` and `thaw_account`.

### Pauser

Granted via `add_role` with `role = Pauser`. Allows the holder to call `pause` and `unpause`. When the program is paused, `mint_to` and `burn` revert with `ProgramPaused`.

### Burner

Granted via `add_role` with `role = Burner`. Allows the holder to call `burn`.

---

## Instructions

### `initialize`

Creates a new SSS-1 stablecoin mint.

**Parameters:**

| Field | Type | Description |
|---|---|---|
| `name` | `String` | Token name (max 32 bytes) |
| `symbol` | `String` | Token symbol (max 10 bytes) |
| `uri` | `String` | Metadata URI (max 200 bytes) |
| `decimals` | `u8` | Decimal places (typically 6) |
| `enable_permanent_delegate` | `bool` | Must be `false` for SSS-1 |
| `enable_transfer_hook` | `bool` | Must be `false` for SSS-1 |
| `default_account_frozen` | `bool` | Must be `false` for SSS-1 |
| `hook_program_id` | `Option<Pubkey>` | Must be `null` for SSS-1 |

**Accounts:**

| Account | Description |
|---|---|
| `authority` | Signer and payer; becomes the master authority |
| `config` | Config PDA to create (`[b"config", mint]`) |
| `mint` | Fresh keypair; will become the Token-2022 mint |
| `token_program` | Token-2022 program |
| `system_program` | System program |
| `rent` | Rent sysvar |

**Behavior:**
1. Validates string lengths.
2. Computes the total mint account size (base + extensions + metadata TLV).
3. Creates the mint account via `create_account` CPI.
4. Initializes `MetadataPointer` extension.
5. Calls `InitializeMint2` with mint authority and freeze authority set to the config PDA.
6. Initializes Token Metadata Interface data (name/symbol/uri).
7. Writes `StablecoinConfig` fields.
8. Emits `StablecoinInitialized` event with preset `"sss-1"`.

**Errors:**
- `StringTooLong` - name/symbol/uri exceeds maximum length

---

### `mint_to`

Mints tokens to a destination token account.

**Parameters:** `amount: u64`

**Accounts:** `authority`, `config`, `mint`, `minter_role` (optional), `destination`, `token_program`

**Behavior:**
- Rejects if `config.paused == true` (`ProgramPaused`).
- Rejects if `amount == 0` (`InvalidAmount`).
- If `authority == config.authority`: mints without quota restriction.
- Otherwise: loads `minter_role` PDA, checks `active == true`, checks `minted + amount <= quota` (if quota is non-zero), increments `minted`.
- CPIs `mint_to` on Token-2022 using config PDA as signer.
- Emits `TokensMinted`.

**Errors:** `ProgramPaused`, `InvalidAmount`, `Unauthorized`, `MinterInactive`, `QuotaExceeded`

---

### `burn`

Burns tokens from a token account.

**Parameters:** `amount: u64`

**Accounts:** `authority`, `config`, `mint`, `from` (token account), `token_program`

**Behavior:**
- Rejects if `config.paused == true`.
- Rejects if `amount == 0`.
- Requires master authority or Burner role.
- CPIs `burn` on Token-2022 using config PDA as signer.
- Emits `TokensBurned`.

**Errors:** `ProgramPaused`, `InvalidAmount`, `Unauthorized`, `RoleInactive`

---

### `freeze_account`

Freezes a token account so it cannot send or receive transfers.

**Parameters:** none

**Accounts:** `authority`, `config`, `mint`, `token_account`, `token_program`, `freezer_role` (optional)

**Behavior:**
- Requires master authority or Freezer role.
- CPIs `freeze_account` on Token-2022 using config PDA (freeze authority) as signer.
- Emits `AccountFrozen { frozen: true }`.

**Errors:** `Unauthorized`, `RoleInactive`

---

### `thaw_account`

Unfreezes a previously frozen token account.

**Parameters:** none

**Accounts:** `authority`, `config`, `mint`, `token_account`, `token_program`, `freezer_role` (optional)

**Behavior:**
- Requires master authority or Freezer role.
- CPIs `thaw_account` on Token-2022 using config PDA as signer.
- Emits `AccountFrozen { frozen: false }`.

**Errors:** `Unauthorized`, `RoleInactive`

---

### `pause`

Globally pauses `mint_to` and `burn`.

**Parameters:** none

**Accounts:** `authority`, `config`, `pauser_role` (optional)

**Behavior:**
- Requires master authority or Pauser role.
- Sets `config.paused = true`.
- Emits `PauseChanged { paused: true }`.

**Errors:** `Unauthorized`, `RoleInactive`

---

### `unpause`

Resumes normal operation after a pause.

**Parameters:** none

**Accounts:** `authority`, `config`, `pauser_role` (optional)

**Behavior:**
- Requires master authority or Pauser role.
- Sets `config.paused = false`.
- Emits `PauseChanged { paused: false }`.

---

### `add_minter`

Registers a new minter with an optional quota.

**Parameters:** `quota: u64` (0 = unlimited)

**Accounts:** `authority`, `config`, `minter` (target address), `minter_role` (to create), `system_program`

**Behavior:**
- Master authority only.
- Creates `MinterRole` PDA with `active = true`, `minted = 0`, `quota = quota`.
- Emits `MinterUpdated { active: true }`.

**Errors:** `Unauthorized`

---

### `remove_minter`

Deactivates an existing minter.

**Parameters:** none

**Accounts:** `authority`, `config`, `minter`, `minter_role`

**Behavior:**
- Master authority only.
- Sets `minter_role.active = false`. PDA is preserved for audit trail.
- Emits `MinterUpdated { active: false }`.

**Errors:** `Unauthorized`

---

### `add_role`

Assigns a compliance role to an address.

**Parameters:** `role: RoleType`, `address: Pubkey`

**Accounts:** `authority`, `config`, `role_entry` (to create), `system_program`

**Behavior:**
- Master authority only.
- Creates `RoleEntry` PDA with `active = true`.
- Emits `RoleUpdated { active: true }`.

**Errors:** `Unauthorized`

---

### `remove_role`

Revokes a compliance role.

**Parameters:** `role: RoleType`, `address: Pubkey`

**Accounts:** `authority`, `config`, `role_entry`

**Behavior:**
- Master authority only.
- Sets `role_entry.active = false`. PDA is preserved.
- Emits `RoleUpdated { active: false }`.

**Errors:** `Unauthorized`

---

### `nominate_authority`

Step 1 of the two-step authority transfer. Writes a pending nominee into the config.

**Parameters:** `new_authority: Pubkey`

**Accounts:** `authority`, `config`

**Behavior:**
- Master authority only.
- Rejects if `config.pending_authority` is already `Some(...)` (`PendingAuthorityExists`).
- Sets `config.pending_authority = Some(new_authority)`.
- Emits `AuthorityNominated`.

**Errors:** `Unauthorized`, `PendingAuthorityExists`

---

### `accept_authority`

Step 2 of the two-step authority transfer. The nominated address signs to accept.

**Parameters:** none

**Accounts:** `new_authority` (signer, must match `config.pending_authority`), `config`

**Behavior:**
- The `new_authority` must sign. The constraint validates it matches `pending_authority`.
- Sets `config.authority = new_authority`, `config.pending_authority = None`.
- Emits `AuthorityTransferred`.

**Errors:** `Unauthorized`, `NoPendingAuthority`

---

## Events

| Event | Fields | Trigger |
|---|---|---|
| `StablecoinInitialized` | `mint, authority, preset, timestamp` | `initialize` |
| `TokensMinted` | `mint, recipient, amount, minter, timestamp` | `mint_to` |
| `TokensBurned` | `mint, from, amount, timestamp` | `burn` |
| `AccountFrozen` | `mint, account, frozen, timestamp` | `freeze_account`, `thaw_account` |
| `PauseChanged` | `mint, paused, authority, timestamp` | `pause`, `unpause` |
| `MinterUpdated` | `mint, minter, active, quota, timestamp` | `add_minter`, `remove_minter` |
| `RoleUpdated` | `mint, address, role, active, timestamp` | `add_role`, `remove_role` |
| `AuthorityNominated` | `mint, current, nominee, timestamp` | `nominate_authority` |
| `AuthorityTransferred` | `mint, old_authority, new_authority, timestamp` | `accept_authority` |

---

## Error Codes

| Code | Name | Message |
|---|---|---|
| 6000 | `Unauthorized` | Caller is not authorized for this operation |
| 6001 | `ProgramPaused` | Program is currently paused |
| 6002 | `InvalidAmount` | Amount must be greater than zero |
| 6003 | `QuotaExceeded` | Minter quota exceeded |
| 6004 | `MinterInactive` | Minter is not active |
| 6005 | `PendingAuthorityExists` | Authority transfer already pending |
| 6006 | `NoPendingAuthority` | No pending authority transfer |
| 6009 | `Sss2NotEnabled` | This instruction requires SSS-2 configuration |
| 6012 | `RoleInactive` | Role is not active |
| 6013 | `MathOverflow` | Overflow in arithmetic operation |
| 6014 | `StringTooLong` | String exceeds maximum length |

---

## Security Properties

- **No token seizure** - The permanent delegate extension is absent. No on-chain actor can forcibly move tokens out of a user's account.
- **Freeze only** - Freeze authority is held by the config PDA, accessible only through the program's role-based access control.
- **Immutable extensions** - SSS-2 extensions cannot be added after initialization.
- **No transfer blocking** - There is no transfer hook. Transfers between non-frozen accounts succeed unconditionally.
- **Auditable roles** - MinterRole and RoleEntry PDAs are preserved when revoked.

---

## Use Cases

- **DAO treasury tokens** - Governance-controlled issuance with freeze capability for dispute resolution.
- **Internal settlement tokens** - Inter-entity transfers within a controlled ecosystem.
- **Ecosystem stablecoins** - Protocol-native units of account without regulatory obligations.
- **Wrapped assets** - Representations of off-chain assets where basic freeze authority suffices.
