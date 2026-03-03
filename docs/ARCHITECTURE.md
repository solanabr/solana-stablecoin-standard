# Architecture — Solana Stablecoin Standard (SSS)

## System Overview

The Solana Stablecoin Standard (SSS) is a two-program system built on Token-2022. It provides a preset-based framework for issuing compliant stablecoins with institutional-grade controls (freeze/seize, role-based access, blacklisting, two-step admin transfer) while remaining fully composable with DEXes and DeFi protocols.

```
┌─────────────────────────────────────────────────────────────────┐
│                        sss-core (Anchor)                         │
│  create_mint · mint_to · burn_from · seize · grant_role ·       │
│  revoke_role · increment_allowance · blacklist · unblacklist ·  │
│  pause · unpause · transfer_admin · accept_admin ·              │
│  initialize_hook · freeze_account · thaw_account                │
└──────────────────────────┬──────────────────────────────────────┘
                           │ CPI (invoke_signed via config PDA)
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                  sss-transfer-hook (native Rust)                 │
│  initialize_hook_config · initialize_extra_account_meta_list ·  │
│  transfer_hook (SPL hook interface) ·                           │
│  add_to_blacklist · remove_from_blacklist                       │
└─────────────────────────────────────────────────────────────────┘
                           │ called automatically by Token-2022
                           ▼
                    every token transfer
```

**Program IDs**

| Program | ID |
|---|---|
| sss-core | `FH3XosNdAdUPfcxVxjUrUoCrGaLw9L3i9eadu7M8nQZQ` |
| sss-transfer-hook | `Hook1111111111111111111111111111111111111111` |

---

## Preset System

Stablecoins are created with one of three presets. The preset is stored on-chain in `StablecoinConfig.preset` and determines which Token-2022 extensions are enabled on the mint.

### SSS-1 — Minimal

Suitable for simple, permissioned tokens that do not require compliance enforcement on every transfer.

| Extension | Enabled |
|---|---|
| MetadataPointer (self) | Yes |
| On-chain Metadata | Yes |
| Role-based access | Yes |
| Pause / unpause | Yes |
| DefaultAccountState (Frozen) | No |
| PermanentDelegate | No |
| TransferHook | No |
| ConfidentialTransferMint | No |

### SSS-2 — Compliant

Suitable for regulated stablecoins (e.g. USDC-style). All new token accounts start frozen; holders must be whitelisted before they can receive or send tokens. The transfer hook enforces the blacklist on every transfer.

| Extension | Enabled |
|---|---|
| MetadataPointer (self) | Yes |
| On-chain Metadata | Yes |
| Role-based access | Yes |
| Pause / unpause | Yes |
| DefaultAccountState (Frozen) | Yes |
| PermanentDelegate | Yes |
| TransferHook | Yes |
| ConfidentialTransferMint | No |

### SSS-3 — Confidential (PoC)

Extends SSS-2 with the `ConfidentialTransferMint` extension, which is the prerequisite for confidential (zero-knowledge) transfers via the ElGamal/sigma-protocol scheme built into Token-2022. The full initialization of this extension (auditor ElGamal public key, auto-approve policy) is beyond the scope of the current PoC; the extension space is reserved on the mint account.

| Extension | Enabled |
|---|---|
| MetadataPointer (self) | Yes |
| On-chain Metadata | Yes |
| Role-based access | Yes |
| Pause / unpause | Yes |
| DefaultAccountState (Frozen) | Yes |
| PermanentDelegate | Yes |
| TransferHook | Yes |
| ConfidentialTransferMint | Yes (PoC — space reserved) |

---

## Differentiation Strategies

SSS implements four compliance patterns derived from real-world stablecoin issuers.

### 1. MasterMinter + Decrementing Allowance (Circle USDC pattern)

The admin grants `Minter` roles with an explicit `allowance` field (u64). Every successful `mint_to` call decrements the minter's allowance by the minted amount. The admin can replenish allowances via `increment_allowance`. A minter with `allowance == 0` is treated as unlimited (backward compatibility), but in practice issuers always set an explicit cap.

```
Admin ──grant_role(Minter, allowance=1_000_000_000_000)──► RoleAccount
Minter ──mint_to(500_000)──► RoleAccount.allowance -= 500_000
Admin ──increment_allowance(500_000)──► RoleAccount.allowance += 500_000
```

### 2. Burn+Mint Seize (Tether destroyBlackFunds pattern)

A `Seizer` role holder can atomically seize tokens from a frozen account in four steps within a single instruction:

```
1. thaw_account(from)           — config PDA is freeze authority
2. burn(from, amount)           — config PDA is permanent delegate
3. freeze_account(from)         — re-freeze the source
4. mint_to(treasury_ata, amount) — config PDA is mint authority
```

This is atomic (single transaction), eliminates the race condition between freeze and burn, and preserves total supply. The `total_seized` counter on `StablecoinConfig` accumulates all seized amounts for auditing.

### 3. Two-Step Admin Transfer (Circle transferOwnership pattern)

Admin keys are rotated via a two-transaction commit-reveal protocol to prevent typo-induced lockout:

```
Step 1: transfer_admin(new_admin)
        ─ sets config.pending_admin = new_admin
        ─ emits AdminTransferInitiated event

Step 2: accept_admin()  (must be signed by new_admin)
        ─ sets config.admin = pending_admin
        ─ clears config.pending_admin
        ─ emits AdminTransferCompleted event
```

If `pending_admin` never calls `accept_admin`, the current admin remains in control and can initiate a new transfer to a different address.

### 4. Blacklist on ALL Operations (including transfers)

The `sss-transfer-hook` program is registered as the `TransferHook` authority on the mint. Token-2022 automatically invokes it on every transfer CPI. The hook reads a `BlacklistEntry` PDA for both sender and receiver; if either exists the transfer reverts with `Blacklisted`.

The sss-core `blacklist` instruction CPIs into sss-transfer-hook using the `config PDA` as a signing authority, so only the admin (who controls the config PDA via `invoke_signed`) can create blacklist entries.

```
User initiates transfer
  → Token-2022 finds TransferHook extension
  → CPI into sss-transfer-hook::transfer_hook
  → check BlacklistEntry PDA(hookConfig, sender)   → revert if exists
  → check BlacklistEntry PDA(hookConfig, recipient) → revert if exists
  → transfer proceeds
```

---

## PDA Hierarchy and Seeds

All program-derived addresses use `findProgramAddressSync` with the seeds listed below.

### sss-core PDAs

| Account | Seeds | Purpose |
|---|---|---|
| `StablecoinConfig` | `["sss_config", mint]` | Global state for one stablecoin mint |
| `RoleAccount` | `["sss_role", config, holder, role_discriminant]` | One role grant per (config, holder, role) tuple |

### sss-transfer-hook PDAs

| Account | Seeds | Program |
|---|---|---|
| `HookConfig` | `["hook_config", mint]` | Per-mint hook state; stores authority (config PDA) |
| `BlacklistEntry` | `["blacklist", hookConfig, wallet]` | Existence = blacklisted |
| `ExtraAccountMetaList` | `["extra-account-metas", mint]` | Required by SPL transfer hook interface |

---

## Instruction Flow Diagrams

### Seize Flow

```
Seizer ──seize(amount)──► sss-core
  │
  ├─ verify role_account.role == Seizer
  ├─ verify !config.paused
  ├─ CPI token_2022::thaw_account(from) [signer: config PDA]
  ├─ CPI token_2022::burn(from, amount) [signer: config PDA, as permanent delegate]
  ├─ CPI token_2022::freeze_account(from) [signer: config PDA]
  ├─ CPI token_2022::mint_to(treasury_ata, amount) [signer: config PDA]
  ├─ config.total_seized += amount (checked_add)
  └─ emit TokensSeized { from, amount, treasury, seizer }
```

### Blacklist Flow

```
Admin ──blacklist(wallet)──► sss-core
  │
  ├─ verify admin == config.admin
  ├─ build add_to_blacklist ix with discriminator
  └─ invoke_signed(sss-transfer-hook::add_to_blacklist) [signer: config PDA]
       └─ creates BlacklistEntry PDA { config, wallet }

On next transfer involving `wallet`:
  Token-2022 ──transfer_hook CPI──► sss-transfer-hook
    └─ account_info(BlacklistEntry PDA) exists → return error Blacklisted
```

### Admin Transfer Flow

```
CurrentAdmin ──transfer_admin(new_admin)──► sss-core
  ├─ verify signer == config.admin
  ├─ config.pending_admin = new_admin
  └─ emit AdminTransferInitiated

NewAdmin ──accept_admin()──► sss-core
  ├─ verify signer == config.pending_admin
  ├─ config.admin = config.pending_admin
  ├─ config.pending_admin = Pubkey::default()
  └─ emit AdminTransferCompleted
```

---

## Role-Based Access Control

Five roles are defined in the `Role` enum. Each grant is a separate `RoleAccount` PDA. The admin can grant or revoke any role at any time.

| Role | Discriminant | Capabilities | Allowance Field |
|---|---|---|---|
| `Minter` | 0 | `mint_to` | Yes — decrements on each mint |
| `Burner` | 1 | `burn_from` | No |
| `Seizer` | 2 | `seize` | No |
| `Pauser` | 3 | `pause`, `unpause` | No |
| `ComplianceOfficer` | 4 | `freeze_account`, `thaw_account` | No |

The admin additionally can call any instruction that checks `config.admin` directly (no role account needed for admin-level operations): `grant_role`, `revoke_role`, `increment_allowance`, `blacklist`, `unblacklist`, `transfer_admin`, `initialize_hook`, `pause`, `unpause`.

---

## Token-2022 Extensions

| Extension | Used By | Purpose |
|---|---|---|
| `MetadataPointer` | All presets | Points mint to itself; enables embedded on-chain metadata |
| Token Metadata Interface | All presets | Stores name, symbol, URI on the mint account |
| `DefaultAccountState(Frozen)` | SSS-2, SSS-3 | New ATAs start frozen; holders must be explicitly thawed |
| `PermanentDelegate` | SSS-2, SSS-3 | Config PDA can burn/transfer from any token account (enables seize) |
| `TransferHook` | SSS-2, SSS-3 | Registers sss-transfer-hook; called on every transfer |
| `ConfidentialTransferMint` | SSS-3 (PoC) | Reserves space for confidential (ZK) transfer capability |

---

## Program Architecture

### sss-core

Written in Anchor. The `StablecoinConfig` PDA is the single authority for all privileged operations. It holds:
- `admin` / `pending_admin` — two-step admin transfer state
- `mint` — the Token-2022 mint
- `preset` — determines available features
- `paused` — global circuit breaker
- `transfer_hook_program` — the registered hook program
- `treasury` — destination for seized funds
- `total_minted` / `total_burned` / `total_seized` — on-chain accounting

The config PDA is used as `invoke_signed` authority for all mint operations (mint authority, freeze authority, permanent delegate) so no private key ever holds these authorities.

### sss-transfer-hook

Written in native Rust with the SPL transfer hook interface. It maintains:
- `HookConfig` PDA — stores the authority (config PDA from sss-core)
- `BlacklistEntry` PDAs — one per blacklisted wallet
- `ExtraAccountMetaList` PDA — tells Token-2022 which extra accounts to pass to the hook

The hook program is intentionally minimal: it only enforces the blacklist. Freeze/thaw enforcement is handled by the `DefaultAccountState` extension and the config PDA's freeze authority.

### CPI Trust Chain

```
User wallet
  → sss-core instruction (Anchor, verified)
  → invoke_signed with config PDA seeds
  → sss-transfer-hook CPI (authority = config PDA)
  → Token-2022 CPI (mint/freeze authority = config PDA)
```

No external program can call sss-transfer-hook's `add_to_blacklist` without possessing the config PDA signer seeds, which only sss-core holds.

---

## Security Model

- **No admin private key holds on-chain authority.** All mint, freeze, and delegate authorities point to the config PDA. The admin key only controls the config account.
- **Two-step admin transfer** prevents accidental or malicious admin key rotation.
- **Decrementing allowances** cap per-minter risk exposure without requiring trust in individual minter operators.
- **Atomic seize** (thaw → burn → freeze → mint) eliminates front-running windows.
- **Transfer hook blacklist** is enforced by Token-2022 runtime, not by the caller; it cannot be bypassed by direct token transfer.

See [SECURITY.md](./SECURITY.md) for the full threat model and audit recommendations.
