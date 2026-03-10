---
title: Instructions
description: All on-chain instructions, accounts, arguments, and role requirements for sss-token and sss-transfer-hook.
---

# Instructions

This page summarizes the current instruction surface from the Rust programs and IDL.

## `sss-token`

### `initialize(params)`

Creates the mint, config PDA, and role registry.

| Item | Value |
| --- | --- |
| Args | `InitializeParams` |
| Signers | `authority`, `mint` |
| Role | none, creator becomes master authority |

Accounts:

- `authority`
- `mint`
- `config`
- `role_registry`
- `system_program`
- `token_program`
- `rent`

Notes:

- `MetadataPointer` is always initialized
- if the preset enables a transfer hook, remaining account `0` must be the hook program ID
- `Custom` requires all four feature flags to be provided

### `mint_tokens(amount)`

Mints tokens to a recipient token account.

| Item | Value |
| --- | --- |
| Args | `amount: u64` |
| Signer | `minter_authority` |
| Role | active minter |

Accounts:

- `minter_authority`
- `config`
- `minter_info`
- `mint`
- `recipient_token_account`
- `recipient_blacklist` optional
- `token_program`

Notes:

- rejects zero amounts
- rejects paused mints
- checks minter quota
- if permanent delegate is enabled and the recipient blacklist PDA exists, minting fails with `RecipientBlacklisted`

### `burn_tokens(amount)`

Burns tokens either from the signer’s own account or from any account through master-authority delegate burn.

| Item | Value |
| --- | --- |
| Args | `amount: u64` |
| Signer | `burner` |
| Role | token holder or master authority |

Accounts:

- `burner`
- `config`
- `mint`
- `burn_token_account`
- `token_program`

Notes:

- rejects zero amounts and insufficient balance
- self-burn requires `burner == token-account owner`
- authority burn requires `burner == masterAuthority` and `enablePermanentDelegate = true`

### `freeze_account()`

Freezes a Token-2022 account through the config PDA.

Accounts:

- `authority`
- `config`
- `role_registry`
- `mint`
- `target_token_account`
- `token_program`

Role:

- master authority or pauser

### `thaw_account()`

Thaws a Token-2022 account.

Accounts:

- `authority`
- `config`
- `role_registry`
- `mint`
- `target_token_account`
- `token_program`

Role:

- master authority or pauser

### `pause()`

Sets `config.is_paused = true`.

Accounts:

- `authority`
- `config`
- `role_registry`

Role:

- pauser or master authority

### `unpause()`

Sets `config.is_paused = false`.

Accounts:

- `authority`
- `config`
- `role_registry`

Role:

- pauser or master authority

### `update_roles(params)`

Updates the operational role holder.

| Arg | Type |
| --- | --- |
| `role` | `Role` |
| `newHolder` | `Pubkey` |

Accounts:

- `authority`
- `config`
- `role_registry`

Role:

- master authority only

Notes:

- `MasterAuthority` cannot be updated through this instruction
- use `transfer_authority` for master rotation
- `Blacklister` and `Seizer` updates require permanent delegate to be enabled

### `update_minter(params)`

Creates or updates a minter PDA.

| Arg | Type |
| --- | --- |
| `isActive` | `bool` |
| `mintQuota` | `u64` |

Accounts:

- `authority`
- `config`
- `role_registry`
- `minter_info`
- `minter_wallet`
- `system_program`

Role:

- master authority only

Notes:

- `minter_info` is `init_if_needed`
- `mintQuota = 0` means unlimited

### `transfer_authority()`

Transfers master authority and cascades inherited roles from the old master to the new one.

Accounts:

- `authority`
- `config`
- `role_registry`
- `new_authority`

Role:

- master authority only

Notes:

- `new_authority` is a signer account on-chain
- the SDK helper takes only a `PublicKey`, so test this flow carefully in your signer setup

### `blacklist_add(params)`

Creates a blacklist entry and freezes the target token account.

| Arg | Type |
| --- | --- |
| `reason` | `String` |

Accounts:

- `authority`
- `config`
- `role_registry`
- `blacklist_entry`
- `address_to_blacklist`
- `mint`
- `target_token_account`
- `token_program`
- `system_program`

Role:

- blacklister or master authority

Notes:

- current source gates this on `enablePermanentDelegate`
- reason length max: `128`
- cannot blacklist the master authority
- `target_token_account` must belong to the wallet being blacklisted

### `blacklist_remove()`

Thaws the target token account and closes the blacklist PDA.

Accounts:

- `authority`
- `config`
- `role_registry`
- `blacklist_entry`
- `mint`
- `target_token_account`
- `token_program`

Role:

- blacklister or master authority

### `seize(amount)`

Seizes tokens from a blacklisted account by burning from source and minting to destination.

Accounts:

- `authority`
- `config`
- `role_registry`
- `blacklist_entry`
- `mint`
- `from_token_account`
- `to_token_account`
- `token_program`

Role:

- seizer or master authority

Notes:

- requires permanent delegate
- source and destination token accounts must differ
- sequence is `thaw -> burn -> mint -> freeze`
- avoids a normal transfer, so it does not trigger the transfer hook

### `attest_reserve(params)`

Writes an immutable reserve attestation record.

| Arg | Type |
| --- | --- |
| `reserveHash` | `[u8; 32]` |
| `totalReservesUsd` | `u64` |
| `totalOutstanding` | `u64` |
| `attestationUri` | `String` |

Accounts:

- `authority`
- `config`
- `role_registry`
- `attestation`
- `system_program`

Role:

- master authority only

Notes:

- `totalReservesUsd` must be greater than or equal to `totalOutstanding`
- URI max length: `200`
- increments `reserveAttestationIndex`
- current code does not emit a reserve-attestation event

## `sss-transfer-hook`

### `initialize_extra_account_meta_list()`

One-time setup for transfer-hook-enabled mints.

Accounts:

- `payer`
- `authority`
- `extra_account_meta_list`
- `mint`
- `config`
- `system_program`

Checks:

- `authority` must equal the raw `master_authority` field read from `config`
- `config` must be the expected config PDA owned by `sss-token`

### `transfer_hook(amount)`

Called by Token-2022 during transfer execution.

Accounts in order:

- `source`
- `mint`
- `destination`
- `authority`
- `extra_account_meta_list`
- `sss_token_program`
- `config`
- `source_blacklist`
- `dest_blacklist`

Behavior:

- if `config` is missing or invalid, the hook allows the transfer
- if `authority == config PDA`, the hook allows the transfer
- if source blacklist exists, it rejects with `SourceBlacklisted`
- if destination blacklist exists, it rejects with `DestinationBlacklisted`

## Event Coverage

Instructions emitting events today:

- `initialize`
- `mint_tokens`
- `burn_tokens`
- `freeze_account`
- `thaw_account`
- `pause`
- `unpause`
- `update_roles`
- `update_minter`
- `transfer_authority`
- `blacklist_add`
- `blacklist_remove`
- `seize`

Defined but not currently emitted:

- `AuditLogRecorded`

Defined but not currently written:

- `AuditLogEntry`
