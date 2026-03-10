---
title: Architecture Overview
description: Account structure, PDA layout, program roles, and Token-2022 extension usage for the Solana Stablecoin Standard.
---

# Architecture Overview

SSS is a two-program Token-2022 system:

- `sss-token` owns stablecoin state and executes issuer operations
- `sss-transfer-hook` enforces blacklist checks on transfer-hook-enabled mints

## Program Responsibilities

### `sss-token`

- initializes the mint and feature extensions
- owns all issuer state PDAs
- acts as mint authority and freeze authority through the config PDA
- optionally acts as permanent delegate

### `sss-transfer-hook`

- owns only the `ExtraAccountMetaList` PDA
- reads `sss-token` blacklist PDAs
- allows or rejects transfers during Token-2022 hook execution

## PDA Layout

| Account | Seeds | Purpose |
| --- | --- | --- |
| `StablecoinConfig` | `["config", mint]` | Global config, metadata, feature flags, counters |
| `RoleRegistry` | `["roles", config]` | Master authority, pauser, blacklister, seizer |
| `MinterInfo` | `["minter", config, minter_wallet]` | Per-minter quota and mint stats |
| `BlacklistEntry` | `["blacklist", config, blocked_address]` | Per-wallet blacklist record |
| `ReserveAttestation` | `["reserve", config, index_le_u64]` | Immutable reserve attestation |
| `AuditLogEntry` | `["audit", config, index_le_u64]` | Defined in source, not currently written |
| `ExtraAccountMetaList` | `["extra-account-metas", mint]` | Transfer-hook account-resolution metadata |

## `StablecoinConfig`

Important fields in the current program:

- metadata: `name`, `symbol`, `uri`, `decimals`
- preset flags: `enablePermanentDelegate`, `enableTransferHook`, `defaultAccountFrozen`, `enableConfidentialTransfers`
- operational state: `isPaused`
- counters: `totalMinted`, `totalBurned`, `totalSeized`, `reserveAttestationIndex`, `auditLogIndex`

## Role Model

| Role | What it can do |
| --- | --- |
| `MasterAuthority` | Full admin, minters, roles, authority transfer, reserve attestations |
| `Pauser` | Pause, unpause, freeze, thaw |
| `Blacklister` | Add and remove blacklist entries |
| `Seizer` | Seize tokens from blacklisted accounts |

The master authority has implicit access to every role on-chain.

## Token-2022 Extensions By Preset

| Extension | SSS1 | SSS2 | SSS3 |
| --- | --- | --- | --- |
| `MetadataPointer` | Yes | Yes | Yes |
| `PermanentDelegate` | No | Yes | Yes |
| `TransferHook` | No | Yes | No |
| `DefaultAccountState` | No | Optional via custom only | No |
| `ConfidentialTransferMint` | No | No | Yes |

## Initialization Flow

1. create the Token-2022 mint account with enough extension space
2. initialize the selected extensions
3. initialize the mint with the config PDA as mint and freeze authority
4. create `StablecoinConfig`
5. create `RoleRegistry`
6. for hook-enabled mints, initialize `ExtraAccountMetaList` in a separate transaction

## Transfer Hook Data Flow

The hook program uses resolved extra accounts to check both token-account owners against blacklist PDAs:

```text
source token account owner -> source blacklist PDA
destination token account owner -> destination blacklist PDA
```

This prevents a delegate from bypassing blacklist enforcement by submitting a clean signer while moving tokens out of a blacklisted account.

## Current Source Notes

- only mint and burn enforce the paused state
- blacklisting, seizure, role changes, freeze, and thaw remain available while paused
- `audit_log_index` exists in config, but the current code does not increment it
- `AuditLogEntry` exists for future on-chain audit persistence, but events are the active audit surface today
