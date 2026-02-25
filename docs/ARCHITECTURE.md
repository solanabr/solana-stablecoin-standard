# Architecture

Solana Stablecoin Standard (SSS) follows a 3-layer architecture that separates base functionality from optional modules and opinionated presets. Two on-chain Anchor programs provide the primitives; the SDK orchestrates them into preset tiers.

## Layer Model

```
+------------------------------------------------------------------+
|                    Layer 3 — Standard Presets                      |
|           SSS-1 (Minimal)  |  SSS-2 (Compliant)  |  SSS-3 (Private)
+------------------------------------------------------------------+
|                    Layer 2 — Modules                               |
|        Compliance Module (hook, blacklist, delegate)               |
|        Privacy Module (confidential transfers, auditor)            |
+------------------------------------------------------------------+
|                    Layer 1 — Base SDK                              |
|     Token-2022 mint creation  |  sss-core (roles, lifecycle)      |
|     CLI (sss-token)           |  TypeScript SDK (@sss/sdk)        |
+------------------------------------------------------------------+
|                       Solana (Token-2022)                          |
+------------------------------------------------------------------+
```

### Layer 1 — Base SDK

The foundation layer provides token creation, lifecycle management, and role-based access control.

**Token Creation (Token-2022)**
- Mint creation with configurable extensions (mint authority, freeze authority, metadata)
- Issuers choose which extensions to enable at mint time
- Config PDA holds all authority: mint authority, freeze authority, and permanent delegate
- Centralizes control behind the role-based access system

**Role Management Program (sss-core)**
- 7 roles: Admin (0), Minter (1), Freezer (2), Pauser (3), Burner (4), Blacklister (5), Seizer (6)
- PDA existence as authorization — if a `RoleAccount` PDA exists and has expected data, the caller is authorized
- Per-minter quota enforcement via `RoleAccount` fields
- Stablecoin lifecycle: mint, burn, freeze, thaw, pause, unpause, seize

**Client Tooling**
- CLI (`sss-token`): Rust-based CLI for all on-chain operations
- TypeScript SDK (`@sss/sdk`): Programmatic access to all SSS functionality
- Backend: Express service for sanctions screening and fiat lifecycle verification
- TUI: ratatui-based terminal dashboard
- Frontend: Next.js 15 explorer

### Layer 2 — Modules

Each module is independently testable and optional. Issuers compose modules based on their regulatory and privacy requirements.

#### Compliance Module

- **Transfer hook program (sss-transfer-hook)**: Enforces blacklist compliance on every transfer. Token-2022 calls the hook automatically during `transfer_checked`.
- **Blacklist PDAs**: `["blacklist", mint, address]` — one PDA per blacklisted address per mint, storing reason and metadata.
- **Permanent delegate**: Config PDA can transfer/burn from any account, enabling token seizure for regulatory compliance.
- **Default frozen accounts**: New token accounts start frozen, gating access behind KYC/AML verification (thaw after approval).
- **Sanctions screening integration point**: Backend provides a pluggable interface for OFAC/sanctions list checking before operations.
- **Fiat lifecycle verification flow**: Backend verifies mint/burn operations correspond to fiat on/off-ramp events.

#### Privacy Module

- **Token-2022 ConfidentialTransferMint extension**: Enables encrypted balances and confidential transfers using ElGamal encryption and zero-knowledge proofs.
- **Auditor ElGamal key**: A designated auditor key can decrypt all transfer amounts for regulatory compliance — preserving privacy from the public while maintaining auditability.
- **Scoped allowlists**: Documented as proof-of-concept for restricting confidential transfers to verified counterparties.

**Incompatibility constraint:** Transfer hooks and confidential transfers are incompatible at the Token-2022 level. SSS-2 uses the Compliance Module (hooks). SSS-3 uses the Privacy Module (auditor key replaces hooks for compliance).

### Layer 3 — Standard Presets

Opinionated combinations of Layer 1 + Layer 2 modules. Presets are SDK-level, not program-level — the on-chain programs are generic. The SDK determines which Token-2022 extensions to enable when creating a mint.

| Capability | SSS-1 (Minimal) | SSS-2 (Compliant) | SSS-3 (Private) |
|---|:---:|:---:|:---:|
| **Layers** | L1 only | L1 + Compliance | L1 + Privacy |
| Mint / Burn | Yes | Yes | Yes |
| Freeze / Thaw | Yes | Yes | Yes |
| Pause / Unpause | Yes | Yes | Yes |
| Seize | Yes | Yes | Yes |
| Role Management | Yes | Yes | Yes |
| Per-minter Quotas | Yes | Yes | Yes |
| Transfer Hook Blacklist | -- | Yes | -- |
| Default Frozen Accounts | -- | Yes | -- |
| Confidential Transfers | -- | -- | Yes |
| Auditor Key | -- | -- | Yes |
| Metadata | On-chain | On-chain | On-chain |

#### Token-2022 Extensions by Preset

**SSS-1 (Minimal)**

| Extension | Purpose |
|---|---|
| MetadataPointer | On-chain token metadata (name, symbol, URI) |
| PermanentDelegate | Config PDA can transfer/burn from any account |

**SSS-2 (Compliant)**

| Extension | Purpose |
|---|---|
| MetadataPointer | On-chain token metadata |
| PermanentDelegate | Config PDA can transfer/burn from any account |
| TransferHook | Routes every transfer through sss-transfer-hook |
| DefaultAccountState(Frozen) | New token accounts start frozen (KYC gating) |

**SSS-3 (Private)**

| Extension | Purpose |
|---|---|
| MetadataPointer | On-chain token metadata |
| PermanentDelegate | Config PDA can transfer/burn from any account |
| ConfidentialTransferMint | Encrypted balances and confidential transfers |

## Programs

### sss-core

Program ID: `Corep3pXJzUGaqpw2xzWQi4q63cn1STABiCDMJhMECB`

The core program manages the stablecoin lifecycle. It stores configuration in a `StablecoinConfig` PDA and enforces authorization through `RoleAccount` PDAs.

**Instructions:**

| Instruction | Required Role | Paused? | Description |
|---|---|---|---|
| `initialize` | (creator) | -- | Create config PDA, grant initial admin role |
| `mint_tokens` | minter | Blocked | Mint tokens via config PDA authority |
| `burn_tokens` | burner | Blocked | Burn tokens via permanent delegate |
| `freeze_account` | freezer | Blocked | Freeze a token account |
| `thaw_account` | freezer | Blocked | Thaw a frozen token account |
| `pause` | pauser | Must be unpaused | Set `paused = true` |
| `unpause` | pauser | Must be paused | Set `paused = false` |
| `seize` | seizer | **Not blocked** | Transfer via permanent delegate (emergency) |
| `grant_role` | admin | -- | Create role PDA for grantee |
| `revoke_role` | admin | -- | Close role PDA, return rent |
| `update_supply_cap` | admin | -- | Change or remove supply cap |
| `update_minter` | admin | -- | Set per-minter quota on RoleAccount |

### sss-transfer-hook

Program ID: `hookXMsC9txN6T8hyS9GCyubBL4nvp9XPWg5wW3z3pH`

The transfer hook program enforces blacklist compliance on every transfer for SSS-2 mints.

**Instructions:**

| Instruction | Description |
|---|---|
| `initialize_extra_account_metas` | Register sender/receiver blacklist PDAs for Token-2022 resolution |
| `transfer_hook` | Called by Token-2022 on every transfer; checks blacklist PDAs |
| `add_to_blacklist` | Create blacklist entry PDA (blacklister role, cross-program verified) |
| `remove_from_blacklist` | Close blacklist entry PDA (blacklister role, cross-program verified) |
| `fallback` | Routes SPL transfer hook interface calls to Anchor handler |

**Cross-program admin verification:** The hook program verifies authorization by re-deriving the `sss-core` config PDA from the mint, then re-deriving the role PDA and checking it matches the provided account. The role account must be owned by the sss-core program.

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

Where `role_u8` is: Admin=0, Minter=1, Freezer=2, Pauser=3, Burner=4, Blacklister=5, Seizer=6

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

## Security Model

### Role-Based Access Control

```
                   +--------+
                   | Admin  |  (role_u8 = 0)
                   +---+----+
                       |
     +---------+-------+-------+---------+----------+
     |         |       |       |         |          |
+----v---+ +---v----+ +v------+ +---v---+ +---v------+ +---v----+
| Minter | |Freezer | |Pauser | |Burner | |Blacklister| |Seizer |
|  (1)   | |  (2)   | | (3)  | | (4)   | |   (5)     | |  (6)  |
+--------+ +--------+ +------+ +-------+ +----------+ +--------+
```

**Admin** (role 0) — Can grant/revoke all roles, update supply cap, update minter quotas. Admin is the only role that can manage other roles.

**Minter** (role 1) — Can mint tokens. Subject to per-minter quota enforcement. Blocked when paused.

**Freezer** (role 2) — Can freeze and thaw token accounts. Both operations blocked when paused.

**Pauser** (role 3) — Can pause and unpause all operations for the stablecoin.

**Burner** (role 4) — Can burn tokens via permanent delegate. Blocked when paused.

**Blacklister** (role 5) — Can add/remove addresses from the blacklist (SSS-2). Cross-program verified.

**Seizer** (role 6) — Can seize tokens via permanent delegate transfer. Works even when paused (emergency power).

Each role is a separate PDA, allowing one address to hold multiple roles simultaneously. Roles are granted per-stablecoin (scoped to a config PDA). Self-revocation of admin role is blocked to prevent permanent lockout.

### Error Handling

#### sss-core Errors

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
| `InvalidRole` | Invalid role value | Role u8 not in 0-6 range |
| `QuotaExceeded` | Minter quota exceeded | Mint would exceed per-minter quota |

#### sss-transfer-hook Errors

| Code | Message | When |
|---|---|---|
| `SenderBlacklisted` | Sender is blacklisted | Transfer from blacklisted address |
| `ReceiverBlacklisted` | Receiver is blacklisted | Transfer to blacklisted address |
| `ReasonTooLong` | Reason exceeds max length | Blacklist reason > 128 chars |
| `Unauthorized` | Not authorized | Non-blacklister calling blacklist operations |

## Events

The programs emit Anchor events for all state-changing operations:

- `StablecoinInitialized` — mint, authority, preset, supply_cap
- `TokensMinted` — mint, to, amount, minter, new_supply
- `TokensBurned` — mint, from, amount, burner, new_supply
- `AccountFrozen` — mint, account, freezer
- `AccountThawed` — mint, account, freezer
- `OperationsPaused` — mint, pauser
- `OperationsUnpaused` — mint, pauser
- `TokensSeized` — mint, from, to, amount, seizer
- `RoleGranted` — config, address, role, granted_by
- `RoleRevoked` — config, address, role, revoked_by
- `ConfigUpdated` — config, field, updater
