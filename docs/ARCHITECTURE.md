# Architecture

Solana Stablecoin Standard (SSS) is composed of two on-chain Anchor programs and an SDK that orchestrates them into three preset tiers.

## System Overview

```
+------------------------------------------------------------------+
|                        Client Layer                               |
|  +----------+  +---------+  +----------+  +------+  +---------+  |
|  | SDK (TS) |  | CLI (Rs)|  | Backend  |  | TUI  |  |Frontend |  |
|  +----+-----+  +----+----+  +----+-----+  +--+---+  +----+----+  |
|       |              |            |            |           |       |
+------------------------------------------------------------------+
        |              |            |            |           |
+------------------------------------------------------------------+
|                      Solana (Token-2022)                          |
|  +----------------------------+  +----------------------------+   |
|  |        sss-core            |  |    sss-transfer-hook       |   |
|  |                            |  |                            |   |
|  | - initialize               |  | - initialize_extra_metas   |   |
|  | - mint_tokens              |  | - transfer_hook (execute)  |   |
|  | - burn_tokens              |  | - add_to_blacklist         |   |
|  | - freeze_account           |  | - remove_from_blacklist    |   |
|  | - thaw_account             |  | - fallback (SPL interface) |   |
|  | - pause / unpause          |  |                            |   |
|  | - seize                    |  |  Cross-program admin       |   |
|  | - grant_role / revoke_role |  |  verification via PDA      |   |
|  | - update_supply_cap        |  |  re-derivation             |   |
|  +----------------------------+  +----------------------------+   |
+------------------------------------------------------------------+
```

## Core Design Decisions

**Presets are SDK-level, not program-level.** The on-chain programs are generic. The SDK determines which Token-2022 extensions to enable when creating a mint, selecting the appropriate set for each preset.

**Config PDA holds all authority.** A single PDA derived from the mint acts as mint authority, freeze authority, and permanent delegate. This centralizes control behind the role-based access system and enables operations like seizure via `transfer_checked` using the permanent delegate privilege.

**PDA existence as authorization.** Role checks use PDA existence verification: if a `RoleAccount` PDA exists at the expected address and has the expected data, the caller is authorized. No separate allowlist or mapping is needed.

**Transfer hooks and confidential transfers are incompatible.** This is a Token-2022 constraint. SSS-2 uses transfer hooks for blacklist enforcement. SSS-3 replaces hooks with an auditor key for regulatory compliance.

## Program Design

### sss-core

The core program manages the stablecoin lifecycle. It stores configuration in a `StablecoinConfig` PDA and enforces authorization through `RoleAccount` PDAs.

**Instructions:**

| Instruction | Required Role | Paused? | Description |
|---|---|---|---|
| `initialize` | (creator) | -- | Create config PDA, grant initial admin role |
| `mint_tokens` | minter | Blocked | Mint tokens via config PDA authority |
| `burn_tokens` | minter | Blocked | Burn tokens via permanent delegate |
| `freeze_account` | freezer | Blocked | Freeze a token account |
| `thaw_account` | freezer | Blocked | Thaw a frozen token account |
| `pause` | pauser | Must be unpaused | Set `paused = true` |
| `unpause` | pauser | Must be paused | Set `paused = false` |
| `seize` | admin | **Not blocked** | Transfer via permanent delegate (emergency) |
| `grant_role` | admin | -- | Create role PDA for grantee |
| `revoke_role` | admin | -- | Close role PDA, return rent |
| `update_supply_cap` | admin | -- | Change or remove supply cap |

### sss-transfer-hook

The transfer hook program enforces blacklist compliance on every transfer for SSS-2 mints.

**Instructions:**

| Instruction | Description |
|---|---|
| `initialize_extra_account_metas` | Register sender/receiver blacklist PDAs for Token-2022 resolution |
| `transfer_hook` | Called by Token-2022 on every transfer; checks blacklist PDAs |
| `add_to_blacklist` | Create blacklist entry PDA (admin-only, cross-program verified) |
| `remove_from_blacklist` | Close blacklist entry PDA (admin-only, cross-program verified) |
| `fallback` | Routes SPL transfer hook interface calls to Anchor handler |

**Cross-program admin verification:** The hook program verifies admin authorization by re-deriving the `sss-core` config PDA from the mint, then re-deriving the admin role PDA and checking it matches the provided account. The admin role account must be owned by the sss-core program.

## PDA Derivation

All PDAs use deterministic seeds for predictable addressing:

### StablecoinConfig

```
Seeds:  ["sss-config", mint_pubkey]
Program: sss-core
Size:   164 bytes
```

Layout: discriminator(8) + authority(32) + mint(32) + preset(1) + paused(1) + supply_cap(1+8) + total_minted(8) + total_burned(8) + bump(1) + reserved(64)

### RoleAccount

```
Seeds:  ["sss-role", config_pubkey, address_pubkey, role_u8]
Program: sss-core
Size:   114 bytes
```

Where `role_u8` is: Admin=0, Minter=1, Freezer=2, Pauser=3

Layout: discriminator(8) + config(32) + address(32) + role(1) + granted_by(32) + granted_at(8) + bump(1)

### BlacklistEntry

```
Seeds:  ["blacklist", mint_pubkey, address_pubkey]
Program: sss-transfer-hook
Size:   245 bytes
```

Layout: discriminator(8) + mint(32) + address(32) + added_by(32) + added_at(8) + reason(4+128) + bump(1)

### ExtraAccountMetaList

```
Seeds:  ["extra-account-metas", mint_pubkey]
Program: sss-transfer-hook
```

This PDA tells Token-2022 which additional accounts to resolve during transfers. It encodes the sender and receiver blacklist PDA derivation rules so Token-2022 can automatically include them.

## Token-2022 Extensions by Preset

### SSS-1 (Minimal)

| Extension | Purpose |
|---|---|
| MetadataPointer | On-chain token metadata (name, symbol, URI) |
| PermanentDelegate | Config PDA can transfer/burn from any account |

### SSS-2 (Compliant)

| Extension | Purpose |
|---|---|
| MetadataPointer | On-chain token metadata |
| PermanentDelegate | Config PDA can transfer/burn from any account |
| TransferHook | Routes every transfer through sss-transfer-hook |
| DefaultAccountState(Frozen) | New token accounts start frozen (KYC gating) |

### SSS-3 (Private)

| Extension | Purpose |
|---|---|
| MetadataPointer | On-chain token metadata |
| PermanentDelegate | Config PDA can transfer/burn from any account |
| ConfidentialTransferMint | Encrypted balances and confidential transfers |

## Data Flows

### Mint Creation (SSS-1)

```
SDK                          Solana
 |                             |
 |  1. SystemProgram.createAccount (mint)
 |  2. InitializeMetadataPointer (config PDA as authority)
 |  3. InitializePermanentDelegate (config PDA)
 |  4. InitializeMint2 (config PDA as mint+freeze authority)
 |  5. InitializeMetadata (name, symbol, uri)
 |  6. sss-core::initialize (create config PDA, admin role PDA)
 |---------------------------->|
 |                             |
```

### Token Transfer (SSS-2 with Transfer Hook)

```
User                Token-2022              sss-transfer-hook
 |                      |                         |
 | transfer_checked     |                         |
 |--------------------->|                         |
 |                      | resolve extra accounts  |
 |                      | (from ExtraAccountMetas)|
 |                      |                         |
 |                      | execute transfer_hook   |
 |                      |------------------------>|
 |                      |                         |
 |                      |  check sender_blacklist |
 |                      |  check receiver_blacklist
 |                      |                         |
 |                      |  OK / Error             |
 |                      |<------------------------|
 |                      |                         |
 |  success / fail      |                         |
 |<---------------------|                         |
```

### Confidential Transfer Flow (SSS-3)

```
1. DEPOSIT (public -> pending confidential)
   - Amount visible on-chain during deposit
   - No ZK proofs required
   - Tokens move: public balance -> pending balance

2. APPLY PENDING BALANCE
   - Credits pending balance to available confidential balance
   - No ZK proofs required
   - Tokens move: pending balance -> available balance

3. CONFIDENTIAL TRANSFER (encrypted)
   - Requires three ZK proofs (Rust solana-zk-sdk):
     a. Range proof (amount >= 0, no underflow)
     b. Equality proof (ElGamal ciphertext matches Pedersen commitment)
     c. Ciphertext validity proof (well-formed ciphertexts)
   - Amount NOT visible on-chain
   - Tokens move: sender available -> recipient pending

4. WITHDRAW (confidential -> public)
   - Requires two ZK proofs:
     a. Range proof (remaining balance >= 0)
     b. Equality proof
   - Amount visible on-chain during withdrawal
   - Tokens move: available balance -> public balance
```

## Role-Based Access Control

```
                   +--------+
                   | Admin  |  (role_u8 = 0)
                   +---+----+
                       |
          +------------+------------+
          |            |            |
     +----v----+  +----v----+ +----v----+
     | Minter  |  | Freezer | | Pauser  |
     | (1)     |  | (2)     | | (3)     |
     +---------+  +---------+ +---------+
```

**Admin** (role 0) -- Can grant/revoke all roles, seize tokens, update supply cap, manage blacklist (SSS-2). Seize works even when paused.

**Minter** (role 1) -- Can mint and burn tokens. Both operations blocked when paused.

**Freezer** (role 2) -- Can freeze and thaw token accounts. Both operations blocked when paused.

**Pauser** (role 3) -- Can pause and unpause all operations for the stablecoin.

Each role is a separate PDA, allowing one address to hold multiple roles simultaneously. Roles are granted per-stablecoin (scoped to a config PDA). Self-revocation of admin role is blocked to prevent permanent lockout.

## Error Handling

### sss-core Errors

| Code | Message | When |
|---|---|---|
| `Paused` | Operations are paused | Mint, burn, freeze, thaw called while paused |
| `NotPaused` | Operations are not paused | Unpause called while not paused |
| `SupplyCapExceeded` | Supply cap exceeded | Mint would exceed configured cap |
| `Unauthorized` | Missing required role | Role PDA does not exist |
| `InvalidPreset` | Invalid preset value | Preset not 1, 2, or 3 |
| `LastAdmin` | Cannot remove the last admin | Admin trying to revoke own admin role |
| `ArithmeticOverflow` | Overflow in arithmetic | total_minted would overflow u64 |
| `MintMismatch` | Mint mismatch | Provided mint != config.mint |
| `InvalidSupplyCap` | Invalid supply cap | New cap < current supply |
| `ZeroAmount` | Amount must be > zero | Mint/burn/seize with amount 0 |
| `InvalidRole` | Invalid role value | Role u8 not in 0-3 range |

### sss-transfer-hook Errors

| Code | Message | When |
|---|---|---|
| `SenderBlacklisted` | Sender is blacklisted | Transfer from blacklisted address |
| `ReceiverBlacklisted` | Receiver is blacklisted | Transfer to blacklisted address |
| `ReasonTooLong` | Reason exceeds max length | Blacklist reason > 128 chars |
| `Unauthorized` | Not an admin | Non-admin calling blacklist operations |

## Events

The programs emit Anchor events for all state-changing operations:

- `StablecoinInitialized` -- mint, authority, preset, supply_cap
- `TokensMinted` -- mint, to, amount, minter, new_supply
- `TokensBurned` -- mint, from, amount, burner, new_supply
- `AccountFrozen` -- mint, account, freezer
- `AccountThawed` -- mint, account, freezer
- `OperationsPaused` -- mint, pauser
- `OperationsUnpaused` -- mint, pauser
- `TokensSeized` -- mint, from, to, amount, seizer
- `RoleGranted` -- config, address, role, granted_by
- `RoleRevoked` -- config, address, role, revoked_by
- `ConfigUpdated` -- config, field, updater
