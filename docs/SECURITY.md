# Security & Threat Model

## Overview

The Solana Stablecoin Standard (SSS) programs adhere to defense-in-depth principles.
Every on-chain action verifies authorization via PDA-based role accounts,
has overflow-safe arithmetic, and emits auditable events.

---

## Threat Model

### In Scope

| Threat | Mitigation |
|--------|-----------|
| Unauthorized minting | Role check — ROLE_MASTER or ROLE_MINTER required |
| Minter over-minting | Per-minter quota + epoch quota enforced in every mint call |
| Supply cap breach | `checked_add` vs `supply_cap` before every mint/batch_mint |
| Integer overflow | All arithmetic uses `checked_add`, `checked_mul`, `checked_div` — zero `unwrap()` in math paths |
| Stale epoch reset | `current_epoch_minted` re-read after potential reset to prevent double-spend |
| Expired multisig proposals | `expires_at` checked in `execute_proposal` |
| BlacklistEntry PDA collision | Seeds = `["blacklist", config.key(), address.key()]` — unique per mint + address |
| Unauthorized hook update | Config has `has_one = authority` constraint |
| Transfer to blacklisted account | Transfer hook blocks via `ExtraAccountMetaList` resolution |
| Token seizure (SSS-2) | Only `permanent_delegate` in config may call `seize_tokens` |

### Out of Scope

- Client-side key management (use a hardware wallet)
- RPC endpoint compromise (use authenticated RPC)
- Solana runtime vulnerabilities

---

## Role-Based Access Control (7 Roles)

Roles are stored as a **bitmask** in a `RoleAccount` PDA seeded on `["role", owner, mint]`.

| Role | Bitmask | Permission |
|------|---------|-----------|
| `ROLE_MASTER` | `0x01` | Full control — can grant/revoke all roles, update supply cap, transfer authority |
| `ROLE_MINTER` | `0x02` | Can mint tokens up to their assigned quota |
| `ROLE_BURNER` | `0x04` | Can burn tokens from authorized accounts |
| `ROLE_PAUSER` | `0x08` | Can pause/unpause the entire contract |
| `ROLE_BLACKLISTER` | `0x10` | Can add/remove addresses from the compliance blacklist |
| `ROLE_SEIZER` | `0x20` | Can trigger token seizure via permanent delegate authority |
| `ROLE_FREEZER` | `0x40` | Can freeze/thaw individual token accounts (SSS-2 compliance) |

Multiple roles may be combined: e.g., `ROLE_MINTER | ROLE_BURNER = 0x06`.

---

## PDA Security

All state is stored in **Program Derived Addresses** — no private-key accounts hold critical state.

| Account | Seeds |
|---------|-------|
| `StablecoinState` | `["stablecoin", mint]` |
| `RoleAccount` | `["role", owner, mint]` |
| `MinterInfo` | `["minter", owner, mint]` |
| `TransferHookConfig` | `["hook_config", mint]` |
| `BlacklistEntry` | `["blacklist", hook_config, address]` |
| `WhitelistEntry` | `["whitelist", hook_config, address]` |
| `ExtraAccountMetaList` | `["extra-account-metas", mint]` |

PDAs are verified on-chain by Anchor's `seeds` + `bump` constraints — no manual `find_program_address` in hot paths.

---

## Arithmetic Safety

All arithmetic uses Rust's checked operations throughout both programs.
No `.unwrap()` or `.expect()` in math paths — errors propagate via `?` operator.

```rust
// Example from batch_mint
let new_supply = state.total_supply
    .checked_add(total_amount)
    .ok_or(StablecoinError::MathOverflow)?;
require!(
    state.supply_cap == 0 || new_supply <= state.supply_cap,
    StablecoinError::SupplyCapExceeded
);
```

---

## Transfer Hook (SSS-2)

The transfer hook enforces compliance on **every** SPL-2022 transfer:

1. **ExtraAccountMetaList**: pre-registered PDAs resolved by Token-2022 at transfer time — no client-side spoofing possible.
2. **Blacklist check**: source + destination owner checked against active `BlacklistEntry` PDAs.
3. **Whitelist bypass**: whitelisted accounts skip fee + minimum-amount checks.
4. **Permanent delegate**: only address stored in `TransferHookConfig.permanent_delegate` may call `seize_tokens`.

---

## Known Limitations

1. **SSS-2 seize via TransferChecked CPI**: Extra accounts from `ExtraAccountMetaList` cannot be forwarded through a CPI `TransferChecked`. Workaround: freeze the target account, then coordinate admin transfer out-of-band.
2. **Multisig threshold**: The multisig implementation stores signers on-chain; for large signer sets (> 10), prefer using Squads Protocol.
3. **Oracle freshness**: `epoch_quota` is time-based via `Clock::get()` — assumes validator clock accuracy within ±30s.
