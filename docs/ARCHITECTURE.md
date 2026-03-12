# Architecture

## System Layers

```
┌──────────────────────────────────────────────────────────────────┐
│                         On-Chain Programs                        │
│                                                                  │
│  sss-core (CZzvCtyZC8KR37DNDeGYpwN46YEc7WEh6RyeSRdhjY4Y)        │
│  - Handles initialize, configure_minter, remove_minter,          │
│    mint_tokens, burn_tokens, freeze_account, thaw_account,       │
│    pause, unpause, update_role, transfer_authority,              │
│    accept_authority, seize,                                       │
│    approve_confidential, revoke_confidential (SSS-3)             │
│                                                                  │
│  sss-hook (9aw7Ac4aGMMfND3BvYgGEcASuvyJiBXnQizbhNBphcNM)        │
│  - Handles initialize_hook, add_to_blacklist,                    │
│    remove_from_blacklist, transfer_hook (via SPL interface)       │
│                                                                  │
│  sss-events (shared Rust crate)                                  │
│  - Anchor event structs used by both programs                    │
└──────────────────────────────────────────────────────────────────┘
              ↑ CPIs / reads config account
┌──────────────────────────────────────────────────────────────────┐
│                        TypeScript SDK                            │
│                                                                  │
│  StablecoinClient     — wraps all sss-core instructions          │
│  ComplianceClient     — extends StablecoinClient with sss-hook   │
│  PDA helpers          — findConfigPda, findMintAuthorityPda, …   │
│  Types                — StablecoinConfig, MinterState, …         │
│  IDL bindings         — generated from anchor build              │
└──────────────────────────────────────────────────────────────────┘
              ↑ imported as library
┌──────────────────────────────────────────────────────────────────┐
│                            CLI                                   │
│                                                                  │
│  sss-token (Node.js binary, commander.js)                        │
│  Commands: init, mint, burn, freeze, pause, minter,              │
│            blacklist, roles, info                                │
└──────────────────────────────────────────────────────────────────┘
              ↑ operated by
┌──────────────────────────────────────────────────────────────────┐
│                          Backend / Indexer                       │
│                                                                  │
│  Anchor event subscriptions (WebSocket)                          │
│  Account polling via getMultipleAccountsInfo                     │
│  Off-chain compliance database (optional)                        │
└──────────────────────────────────────────────────────────────────┘
```

## Program Design

### sss-core

A single Anchor program that implements all three presets. Preset selection happens at initialization time (`params.preset`); the preset value is stored in `StablecoinConfig.preset` and checked by instructions that are preset-gated (e.g., `seize` requires preset >= 2, `approve_confidential` requires preset >= 3).

The program does not fork into separate binaries per preset. This approach keeps deployment simple and allows a single IDL to cover all presets.

**Instruction pattern (all instructions):**

Every instruction handler in sss-core follows a consistent 7-step pattern documented in the source:

```
1. VALIDATE       — parameter bounds, preset compatibility
2. READ           — load account state
3. COMPUTE        — derive intermediate values (e.g., remaining quota)
4. SAFETY CHECK   — invariant assertions (e.g., quota not exceeded)
5. EXECUTE CPI    — call Token-2022 program
6. UPDATE STATE   — write changes to program accounts
7. EMIT EVENT     — emit an Anchor event for indexers
```

### sss-hook

A separate program implementing the `spl-transfer-hook-interface`. It is only required for SSS-2 mints. The hook is invoked automatically by the Token-2022 program on every `transfer_checked` call for mints that have the `TransferHook` extension pointing to this program.

The hook reads the `StablecoinConfig` from sss-core cross-program (without a CPI, by deserializing the account data directly) to check the pause flag, and reads `BlacklistEntry` accounts to check both sender and receiver.

A `fallback` handler is registered to translate the SPL transfer hook interface discriminator into the Anchor handler, since the two discriminator schemes differ.

## PDA Derivation

All PDAs are derived with `PublicKey::findProgramAddressSync` using the seeds below.

| Account | Seeds | Program |
|---|---|---|
| `StablecoinConfig` | `["config", mint]` | sss-core |
| `MintAuthority` | `["mint-authority", mint]` | sss-core |
| `MinterState` | `["minter", config, minter_wallet]` | sss-core |
| `HookConfig` | `["hook-config", mint]` | sss-hook |
| `BlacklistEntry` | `["blacklist", mint, wallet]` | sss-hook |
| `AllowlistEntry` | `["allowlist", mint, wallet]` | sss-core |
| `ExtraAccountMetaList` | `["extra-account-metas", mint]` | sss-hook |

The `MintAuthority` PDA serves triple duty: it is set as the Token-2022 mint authority, freeze authority, and (for SSS-2) permanent delegate. No private key holder controls token supply directly.

## State Account Schemas

### StablecoinConfig

Stored at PDA `["config", mint]`, owned by sss-core.

```
Field               Type      Description
────────────────────────────────────────────────────────────────────
mint                Pubkey    Token-2022 mint address
preset              u8        1 = SSS-1, 2 = SSS-2, 3 = SSS-3
authority           Pubkey    Master admin; can update all roles
pending_authority   Pubkey    Pending authority for two-step transfer
master_minter       Pubkey    Can configure/remove minters
pauser              Pubkey    Can pause/unpause
blacklister         Pubkey    Can blacklist wallets (SSS-2) and freeze/thaw
paused              bool      Whether operations are currently paused
total_minted        u64       Lifetime minted amount (audit)
total_burned        u64       Lifetime burned amount (audit)
total_seized        u64       Lifetime seized amount (SSS-2+ audit)
bump                u8        Config PDA bump
mint_authority_bump u8        MintAuthority PDA bump
```

### MinterState

Stored at PDA `["minter", config, minter_wallet]`, owned by sss-core. Account is preserved (not closed) when a minter is removed, providing an immutable audit trail.

```
Field           Type    Description
────────────────────────────────────────────────────────
config          Pubkey  Parent StablecoinConfig PDA
minter          Pubkey  Minter wallet address
quota           u64     Maximum lifetime mint allowance
minted_amount   u64     Tokens minted so far (monotonic)
enabled         bool    Whether minter is currently active
bump            u8      PDA bump
```

### HookConfig

Stored at PDA `["hook-config", mint]`, owned by sss-hook.

```
Field               Type    Description
──────────────────────────────────────────────────────────────
mint                Pubkey  Token-2022 mint this hook serves
stablecoin_config   Pubkey  sss-core StablecoinConfig PDA
core_program        Pubkey  sss-core program ID
bump                u8      PDA bump
```

### BlacklistEntry

Stored at PDA `["blacklist", mint, wallet]`, owned by sss-hook.

```
Field           Type    Description
────────────────────────────────────────────────────────────────────
mint            Pubkey  Stablecoin mint
wallet          Pubkey  Blacklisted wallet address
blacklisted     bool    Current blacklist status
reason          String  Human-readable reason (max 64 bytes on-chain)
blacklisted_at  i64     Unix timestamp of blacklisting
blacklisted_by  Pubkey  Blacklister address at time of action
bump            u8      PDA bump
```

### AllowlistEntry (SSS-3)

Stored at PDA `["allowlist", mint, wallet]`, owned by sss-core. Tracks per-wallet approval for confidential transfers.

```
Field           Type    Description
────────────────────────────────────────────────────────────────────
mint            Pubkey  Stablecoin mint
wallet          Pubkey  Approved wallet address
approved        bool    Current approval status
approved_by     Pubkey  Authority who approved
approved_at     i64     Unix timestamp of approval
bump            u8      PDA bump
```

## Instruction Flows

### initialize

1. Validate preset (1, 2, or 3), decimals (0–9), name/symbol/uri lengths.
2. For preset >= 2, require `hook_program` account.
3. Compute extension list: SSS-1 uses `[MetadataPointer, MintCloseAuthority]`; SSS-2 adds `[PermanentDelegate, TransferHook, DefaultAccountState]`; SSS-3 adds `[ConfidentialTransferMint]`.
4. Calculate total account size including variable-length token metadata.
5. Create mint account via system program CPI.
6. Initialize each extension via Token-2022 CPIs (must precede `initialize_mint2`).
7. Call `initialize_mint2` with `mint_authority` PDA as both mint and freeze authority.
8. Call `token_metadata_initialize` (signed by `mint_authority` PDA) to write on-chain metadata.
9. Populate `StablecoinConfig`; all roles default to `authority`.
10. Emit `StablecoinInitialized` event.

### configure_minter / remove_minter

`configure_minter`: Creates or updates `MinterState` for a given wallet. The `master_minter` sets the lifetime `quota`. If the PDA already exists, quota is updated and `enabled` is set to true.

`remove_minter`: Sets `MinterState.enabled = false`. The account is not closed so the quota and minted_amount history are preserved.

### mint_tokens

1. Verify not paused.
2. Verify minter is enabled.
3. Check `quota - minted_amount >= amount`.
4. CPI `mint_to` signed by `mint_authority` PDA signer seeds.
5. Increment `minter_state.minted_amount` and `config.total_minted`.
6. Emit `TokensMinted`.

### burn_tokens

1. Verify not paused.
2. Verify `amount > 0`.
3. CPI `burn`; the burner signs directly (no PDA required for burn).
4. Increment `config.total_burned`.
5. Emit `TokensBurned`.

Burn quota: burning does not restore a minter's quota. Any token holder can burn tokens from their own account.

### freeze_account / thaw_account

Callable by `authority` or `blacklister`. These instructions intentionally **bypass the pause check**, allowing compliance actions even during an emergency pause. They CPI `freeze_account` / `thaw_account` signed by the `mint_authority` PDA.

### pause / unpause

Callable by `pauser`. Sets `config.paused = true/false`. Subsequent calls to `mint_tokens`, `burn_tokens`, and (for SSS-2) transfers via the hook all check this flag.

### seize (SSS-2+)

1. Verify `config.preset >= 2`; reject with `PresetFeatureUnavailable` otherwise.
2. Verify caller is `authority`.
3. CPI `transfer_checked` using `mint_authority` PDA as the permanent delegate signer.
4. Pass remaining accounts so Token-2022 can invoke the transfer hook.
5. Emit `TokensSeized`.

**Seize and pause interaction:** Seize uses `transfer_checked`, which triggers the transfer hook, which checks the pause flag. This means seize is **implicitly blocked during a pause**. This is by design — the correct operational flow for seizing during an incident is: (1) freeze the target account (freeze bypasses pause), (2) unpause briefly, (3) seize, (4) re-pause. The frozen account prevents the target from moving tokens during the brief unpause window.

### approve_confidential (SSS-3 only)

1. Verify `config.preset >= 3`.
2. Verify caller is `authority` and contract is not paused.
3. Create or load the `AllowlistEntry` PDA via `init_if_needed`.
4. Reject if entry is already approved (`AlreadyApproved`).
5. CPI to Token-2022 `ConfidentialTransferExtension::ApproveAccount` signed by `mint_authority` PDA.
6. Populate the `AllowlistEntry` with mint, wallet, approval state, and timestamp.
7. Emit `ConfidentialAccountApproved`.

### revoke_confidential (SSS-3 only)

1. Verify `config.preset >= 3`.
2. Verify caller is `authority`.
3. Verify the `AllowlistEntry` is currently approved (`NotApproved` otherwise).
4. Set `allowlist_entry.approved = false`. Account is preserved for audit trail.
5. Emit `ConfidentialAccountRevoked`.

Note: Revocation intentionally bypasses the pause check (like freeze/thaw) since it is an authority-level compliance action that should succeed even during a global pause.

### transfer_authority / accept_authority

Two-step ownership transfer:

1. `transfer_authority`: Sets `config.pending_authority = new_authority`. Callable only by current `authority`.
2. `accept_authority`: Verifies `signer == pending_authority`, then sets `authority = pending_authority` and clears `pending_authority`. Callable only by the pending authority.

This pattern prevents accidental transfers to unreachable addresses.

### initialize_hook (sss-hook)

1. Populate `HookConfig` with mint, stablecoin_config, and core_program references.
2. Build the `ExtraAccountMetaList` with four extra entries:
   - Index 5: `core_program` (literal pubkey)
   - Index 6: `stablecoin_config` (external PDA from sss-core using `["config", mint]`)
   - Index 7: `BlacklistEntry` for source token account owner (PDA from sss-hook using `["blacklist", mint, source_owner]`, owner extracted from source token account data at offset 32)
   - Index 8: `BlacklistEntry` for destination token account owner (same pattern)
3. Create the `ExtraAccountMetaList` account via system program CPI using PDA signer seeds.
4. Initialize the list via `ExtraAccountMetaList::init`.

## Token-2022 Extension Composition

### SSS-1 Extension Set

```
MetadataPointer
  └── update_authority = mint_authority PDA
  └── metadata_address = mint (self-referential)

MintCloseAuthority
  └── close_authority = mint_authority PDA
```

### SSS-2 Extension Set (all SSS-1 extensions plus)

```
PermanentDelegate
  └── delegate = mint_authority PDA
  └── enables seize/clawback without token account approval

TransferHook
  └── authority = mint_authority PDA
  └── program_id = sss-hook program ID
  └── invoked by Token-2022 on every transfer_checked

DefaultAccountState
  └── state = Frozen
  └── all new token accounts start frozen (KYC gate)
  └── must be thawed by authority or blacklister before use
```

### SSS-3 Extension Set (all SSS-2 extensions plus)

```
ConfidentialTransferMint
  └── authority = mint_authority PDA
  └── auto_approve_new_accounts = false
  └── auditor_elgamal_pubkey = None
  └── compliance via allowlist: authority must call approve_confidential
      per wallet before they can use confidential transfers
  └── confidential transfers bypass the transfer hook, so blacklist
      enforcement uses the AllowlistEntry allowlist instead
```

## Transfer Hook Flow

The following sequence occurs on every `transfer_checked` for an SSS-2 mint:

```
Caller
  │
  ▼
Token-2022 Program (transfer_checked)
  │
  ├── validates source / destination token accounts
  ├── resolves ExtraAccountMetaList PDA
  │     seeds: ["extra-account-metas", mint]
  │     program: sss-hook
  │
  ├── resolves extra accounts from the list:
  │     [5] core_program (literal)
  │     [6] stablecoin_config (external PDA: ["config", mint] @ core_program)
  │     [7] source_blacklist (PDA: ["blacklist", mint, source_owner])
  │     [8] dest_blacklist   (PDA: ["blacklist", mint, dest_owner])
  │
  └── CPIs sss-hook::transfer_hook with resolved accounts
        │
        ├── 1. check_is_transferring
        │       reads TransferHookAccount extension from source token
        │       rejects if not in transfer context (direct call protection)
        │
        ├── 2. check_paused
        │       deserializes stablecoin_config account data
        │       rejects if config.paused == true
        │
        ├── 3. check_blacklist (source owner)
        │       deserializes source_blacklist account data
        │       rejects if entry exists and blacklisted == true
        │       uninitialized / missing accounts pass through
        │
        └── 4. check_blacklist (destination owner)
                same as above for destination
                transfer proceeds only if all checks pass
```

## Security Model

### PDA Authority

Token supply control (minting, freezing, seizing) is entirely mediated by the `mint_authority` PDA. The PDA is derived deterministically from `["mint-authority", mint]` and is owned by sss-core. The program only signs CPIs through this PDA when all authorization checks have passed. There is no escape hatch to invoke these operations without going through the program.

### Role-Based Access Control

Each instruction checks the caller against the appropriate role field in `StablecoinConfig`:

- `configure_minter`, `remove_minter`: `signer == config.master_minter`
- `mint_tokens`: `MinterState.enabled && signer.key == minter_state.minter`
- `pause`, `unpause`: `signer == config.pauser`
- `freeze_account`, `thaw_account`: `signer == config.authority || signer == config.blacklister`
- `update_role`, `transfer_authority`, `seize`: `signer == config.authority`
- `approve_confidential`, `revoke_confidential`: `signer == config.authority`
- `add_to_blacklist`, `remove_from_blacklist`: `signer == config.blacklister` (verified by reading `stablecoin_config` in sss-hook)
- `accept_authority`: `signer == config.pending_authority`

Roles are stored in a single `StablecoinConfig` account, making the authorization state auditable in a single on-chain read.

### Two-Step Authority Transfer

Authority changes go through a mandatory pending state. Until `accept_authority` is called by the new keypair, the transfer is revocable by the current authority (by overwriting `pending_authority` with a new value or with `Pubkey::default()`).

### Cross-Program Account Reading

The transfer hook reads `StablecoinConfig` and `BlacklistEntry` accounts by deserializing their raw account data rather than via CPI. The hook validates the Anchor discriminator bytes before deserialization, preventing spoofed accounts from passing checks.

### Transfer Context Verification

The `check_is_transferring` guard in the hook reads the `TransferHookAccount` extension from the source token account. Token-2022 sets this flag atomically at the start of a transfer and clears it at the end. Calling the hook instruction directly (outside a transfer) will fail this check.

## Cross-Program Interactions

```
sss-core::seize
  └── CPI → Token-2022::transfer_checked (with mint_authority PDA signer)
                └── CPI → sss-hook::transfer_hook
                              └── reads sss-core StablecoinConfig (no CPI, direct data read)
                              └── reads sss-hook BlacklistEntry accounts

sss-core::mint_tokens
  └── CPI → Token-2022::mint_to (with mint_authority PDA signer)

sss-core::freeze_account
  └── CPI → Token-2022::freeze_account (with mint_authority PDA signer)

sss-core::approve_confidential (SSS-3)
  └── CPI → Token-2022::ConfidentialTransferExtension::ApproveAccount
              (with mint_authority PDA signer)

sss-hook::initialize_hook
  └── reads sss-core StablecoinConfig (validates mint has config)
  └── CPI → System Program (create ExtraAccountMetaList account)
```
