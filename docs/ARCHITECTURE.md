# SSS Architecture

## Three-Layer Model

The Solana Stablecoin Standard is organized into three layers:

```
┌─────────────────────────────────────────────────────────────┐
│  PRESETS                                                    │
│                                                             │
│  SSS-1 (Minimal)              SSS-2 (Compliant)            │
│  - MetadataPointer            - MetadataPointer             │
│  - FreezeAuthority            - FreezeAuthority             │
│                               - PermanentDelegate           │
│                               - TransferHook                │
│                               - DefaultAccountState (opt)   │
├─────────────────────────────────────────────────────────────┤
│  MODULES                                                    │
│                                                             │
│  roles.rs          Minter, Freezer, Pauser, Burner,        │
│                    Blacklister, Seizer                      │
│  compliance.rs     Blacklist add/remove, token seizure      │
│  authority.rs      Two-step authority nominate/accept       │
│  pause.rs          Global emergency pause                   │
│  freeze.rs         Account freeze / thaw                    │
│  mint.rs           Quota-bounded minting                    │
│  burn.rs           Authorized token burning                 │
├─────────────────────────────────────────────────────────────┤
│  ON-CHAIN PROGRAMS                                          │
│                                                             │
│  sss_token (Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS)│
│  transfer_hook (HmbTLCmaGvZhKnn1Zfa1JVnp7vkMV4DYVxPLWBVoN65)│
│                                                             │
│  Token-2022 runtime (on-chain enforcement layer)           │
└─────────────────────────────────────────────────────────────┘
```

---

## On-Chain Program Architecture

### sss_token Program

The core program governs the entire stablecoin lifecycle. All Token-2022 mint authority and freeze authority are held by the **config PDA**, not by any human key. The program signs CPI calls to the token program using the PDA signer seeds `[b"config", mint, bump]`.

This design ensures that:
- No individual key can directly invoke privileged token operations.
- All compliance operations are mediated by on-chain access control checks.
- Authority transfers require two on-chain transactions.

### transfer_hook Program

A separate Anchor program that implements the SPL Transfer Hook Interface. Token-2022 calls this program via CPI on every transfer of an SSS-2 mint. The hook checks both the source and destination owner wallet addresses against on-chain `BlacklistEntry` PDAs. If either is blacklisted and active, the transfer is rejected unconditionally.

---

## PDA Layout

All PDAs are owned by the `sss_token` program unless noted.

### StablecoinConfig PDA

Seeds: `[b"config", mint_pubkey]`

The central configuration account for a stablecoin mint. Created at `initialize` time, never migrated.

```
Field                    Type            Description
─────────────────────────────────────────────────────────────
authority                Pubkey          Master authority (32 bytes)
pending_authority        Option<Pubkey>  Two-step transfer nominee (33 bytes)
mint                     Pubkey          Token-2022 mint this config governs (32 bytes)
paused                   bool            Emergency pause flag (1 byte)
enable_permanent_delegate bool           SSS-2: permanent delegate active (1 byte)
enable_transfer_hook     bool            SSS-2: transfer hook active (1 byte)
default_account_frozen   bool            New ATAs start frozen (1 byte)
hook_program_id          Option<Pubkey>  Transfer hook program address (33 bytes)
bump                     u8              Canonical PDA bump (1 byte)
_reserved                [u8; 64]        Reserved for future fields (64 bytes)
─────────────────────────────────────────────────────────────
Total (excluding discriminator): ~199 bytes
```

The `enable_permanent_delegate` and `enable_transfer_hook` flags are immutable after `initialize`. They determine which SSS-2 compliance instructions are available.

### MinterRole PDA

Seeds: `[b"minter", mint_pubkey, minter_pubkey]`

Created by `add_minter`. Preserved (set `active = false`) by `remove_minter` to maintain an audit trail.

```
Field     Type     Description
────────────────────────────────────────────
minter    Pubkey   The authorized minter address
mint      Pubkey   Mint this role is scoped to
quota     u64      Maximum cumulative tokens (0 = unlimited)
minted    u64      Running total minted so far
active    bool     Whether this entry is currently active
bump      u8       Canonical PDA bump
```

Quota enforcement: if `quota > 0`, the program requires `minted + amount <= quota`. The `minted` counter is incremented atomically in the same instruction that mints tokens.

### RoleEntry PDA

Seeds: `[b"role", mint_pubkey, role_byte, address_pubkey]`

Stores a single compliance role assignment. One PDA per (mint, role, address) triple.

```
Field     Type       Description
────────────────────────────────────────────────
address   Pubkey     The account holding this role
mint      Pubkey     Mint this role is scoped to
role      RoleType   Blacklister(0), Pauser(1), Seizer(2), Burner(3), Freezer(4)
active    bool       Whether the role is currently active
bump      u8         Canonical PDA bump
```

Role types are encoded as a single byte in the PDA seed, so different role types for the same (mint, address) pair produce distinct PDAs.

### BlacklistEntry PDA

Seeds: `[b"blacklist", mint_pubkey, target_pubkey]`

SSS-2 only. Created by `add_to_blacklist`. Deactivated (not closed) by `remove_from_blacklist`. The entry is preserved on-chain after removal to provide an immutable audit trail.

```
Field           Type      Description
─────────────────────────────────────────────────────
address         Pubkey    The blacklisted wallet or program
mint            Pubkey    Mint this entry is scoped to
reason          String    Human-readable reason (max 128 bytes)
blacklisted_at  i64       Unix timestamp of blacklisting
blacklisted_by  Pubkey    Who performed the blacklisting
active          bool      false = removed from blacklist
bump            u8        Canonical PDA bump
```

### ExtraAccountMetaList PDA

Seeds: `[b"extra-account-metas", mint_pubkey]`
Owner: `transfer_hook` program

Required for the SPL Transfer Hook Interface. Stores the PDA derivation rules for the two extra accounts that Token-2022 resolves and passes to the hook on every transfer:
- Extra account 0: Source owner's `BlacklistEntry` PDA
- Extra account 1: Destination owner's `BlacklistEntry` PDA

The destination owner is resolved at runtime by reading bytes `[32..64]` from the destination token account data (the `owner` field in the SPL token account layout).

---

## Token-2022 Extension Selection

| Extension | SSS-1 | SSS-2 |
|---|---|---|
| MetadataPointer | Always | Always |
| FreezeAuthority | Always (config PDA) | Always (config PDA) |
| PermanentDelegate | No | Yes (config PDA) |
| TransferHook | No | Yes (transfer_hook program) |
| DefaultAccountState: Frozen | No | Optional |

Extensions must be initialized in a specific order before `InitializeMint2`. The `initialize` instruction handles this sequence:

1. `initialize_metadata_pointer` - points metadata to the mint itself (self-hosted)
2. `initialize_permanent_delegate` (SSS-2) - delegates to config PDA
3. `initialize_transfer_hook` (SSS-2) - registers the hook program
4. `initialize_default_account_state` (SSS-2, optional) - sets frozen as default
5. `initialize_mint2` - finalizes the mint
6. `initialize` (Token Metadata Interface) - writes name/symbol/uri into the mint

The mint account size is computed upfront using `ExtensionType::try_calculate_account_len` plus the metadata TLV blob size, and allocated with a single `create_account` CPI before any extension initializer runs.

---

## Transfer Hook Program Flow (SSS-2)

```
User or program initiates transfer
         |
         v
Token-2022 runtime validates transfer
         |
         v
Token-2022 CPIs into transfer_hook program
  Passes accounts:
    [0] source token account
    [1] mint
    [2] destination token account
    [3] source owner/authority
    [4] ExtraAccountMetaList PDA
    [5] source owner BlacklistEntry PDA  (resolved from ExtraAccountMetaList)
    [6] destination owner BlacklistEntry PDA  (resolved from ExtraAccountMetaList)
         |
         v
hook: check account [5] (source blacklist entry)
  - If account data_len == 0: source is not blacklisted, continue
  - If account exists and entry.active == true: REJECT (SourceBlacklisted)
         |
         v
hook: check account [6] (destination blacklist entry)
  - If account data_len == 0: destination is not blacklisted, continue
  - If account exists and entry.active == true: REJECT (DestinationBlacklisted)
         |
         v
hook returns Ok(()) — Token-2022 completes the transfer
```

The hook reads `BlacklistEntry` accounts that live in the `sss_token` program's address space. No cross-program write is performed; the hook is read-only with respect to blacklist state.

Blacklist enforcement is **immediate**: the moment `add_to_blacklist` completes, the next transfer attempt by or to that address will fail at the hook level, regardless of whether the account is also frozen.

---

## Role-Based Access Control Model

```
Master Authority
 │
 ├── All instructions (unrestricted)
 ├── add_minter / remove_minter
 ├── add_role / remove_role
 └── nominate_authority

Delegated Roles (granted by Master Authority via add_role)
 │
 ├── Minter (quota-bounded)
 │     mint_to (up to quota)
 │
 ├── Freezer
 │     freeze_account, thaw_account
 │
 ├── Pauser
 │     pause, unpause
 │
 ├── Burner
 │     burn
 │
 ├── Blacklister (SSS-2)
 │     add_to_blacklist, remove_from_blacklist
 │
 └── Seizer (SSS-2)
       seize
```

Role checks follow this pattern in every instruction:
1. Check if `authority == config.authority` (master) - if so, permit.
2. Otherwise, load the optional `RoleEntry` PDA for the caller.
3. Require the PDA exists and `role_entry.active == true`.
4. Require the `role_entry.role` matches the required role type.

The master authority always bypasses role checks. Delegated roles are scoped per mint - a Blacklister for mint A has no authority over mint B.

---

## Security Model

### Config PDA as Sole Authority

The config PDA (`seeds = [b"config", mint]`) is the **mint authority**, **freeze authority**, and (for SSS-2) **permanent delegate** of the Token-2022 mint. No human key holds these authorities directly.

This means:
- Minting, freezing, and seizure require the `sss_token` program to sign via `invoke_signed`.
- The program only signs after its own access control checks pass.
- A compromised operator key cannot directly call Token-2022 instructions - it must go through the program's authorization logic.

### Two-Step Authority Transfer

Authority transfers require two separate on-chain transactions:

1. `nominate_authority(new_authority)` - current authority writes `pending_authority = Some(new_authority)`.
2. `accept_authority()` - the new authority signs a transaction proving key possession.

If only one step occurs, the authority does not transfer. This prevents fat-finger key transfers and requires the receiving party to actively accept control.

### SSS-2 Immutability

The `enable_permanent_delegate` and `enable_transfer_hook` fields are written once at `initialize` and never updated. A mint cannot be upgraded from SSS-1 to SSS-2 after creation. This prevents a bait-and-switch where a mint is initially presented as minimal and later has compliance extensions added.

### Blacklist Entry Preservation

`remove_from_blacklist` sets `active = false` but does not close the PDA. The on-chain record of who was blacklisted, when, why, and by whom is preserved permanently and is publicly auditable.

---

## Data Flow: Key Operations

### Mint Tokens

```
Caller (authority or minter)
  |
  | mint_to(amount)
  v
sss_token program:
  1. Check config.paused == false
  2. Check amount > 0
  3. If caller != config.authority:
       Load MinterRole PDA
       Check minter_role.active == true
       If quota > 0: check minted + amount <= quota
  4. CPI: token_program.mint_to(
           mint = mint,
           to = destination,
           authority = config PDA  [signed with PDA seeds]
         )
  5. Update minter_role.minted += amount
  6. Emit TokensMinted event
```

### Freeze an Account

```
Caller (authority or freezer role)
  |
  | freeze_account(token_account)
  v
sss_token program:
  1. If caller != config.authority:
       Load RoleEntry PDA (role = Freezer)
       Check role_entry.active == true
  2. CPI: token_program.freeze_account(
           account = token_account,
           mint = mint,
           authority = config PDA  [signed with PDA seeds]
         )
  3. Emit AccountFrozen event
```

### Seize Tokens (SSS-2)

```
Caller (authority or seizer role)
  |
  | seize(from_account, to_account, amount)
  v
sss_token program:
  1. Check config.enable_permanent_delegate == true
  2. Check config.enable_transfer_hook == true (SSS-2 guard)
  3. Check amount > 0
  4. If caller != config.authority:
       Load RoleEntry PDA (role = Seizer)
       Check role_entry.active == true
  5. CPI: token_program.transfer_checked(
           from = from_account,
           mint = mint,
           to = to_account,
           authority = config PDA  [signed — permanent delegate]
           amount = amount,
           decimals = mint.decimals
         )
     (Token-2022 accepts config PDA as authority because it
      is the registered permanent delegate)
  6. Emit TokensSeized event
```

Note: seizure does not require the source account to be frozen. The permanent delegate extension permits the config PDA to move tokens from any account regardless of freeze state.
