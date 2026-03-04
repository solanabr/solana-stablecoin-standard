# SSS-2: Compliant Stablecoin Standard

## Overview

SSS-2 is the compliant stablecoin standard for Solana. It extends SSS-1 with three additional Token-2022 extensions — PermanentDelegate, TransferHook, and optionally DefaultAccountState — and two additional compliance roles (Blacklister, Seizer).

SSS-2 is designed for regulated payment stablecoin issuers who must implement:
- Sanctions screening (OFAC SDN list)
- Transaction blocking for blacklisted parties
- Court-ordered or regulatory token seizure
- Full audit trail of compliance actions

SSS-2 is aligned with the requirements of the GENIUS Act (Guiding and Establishing National Innovation for US Stablecoins Act). See [docs/COMPLIANCE.md](COMPLIANCE.md) for the detailed regulatory mapping.

---

## Token-2022 Extensions

SSS-2 includes all SSS-1 extensions plus:

### PermanentDelegate

The config PDA is registered as the **permanent delegate** for the mint. The permanent delegate has the ability to transfer tokens out of any token account for this mint, without the account owner's signature or approval.

This is the on-chain mechanism that enables token seizure. It is analogous to a contractual right to claw back tokens, enforced unconditionally by the Token-2022 runtime.

The permanent delegate is the config PDA, not an individual key. Seizure operations must go through the `sss_token` program's authorization checks (Seizer role or master authority).

### TransferHook

Every token transfer for an SSS-2 mint triggers a CPI from the Token-2022 runtime into the `transfer_hook` program. The hook checks both the **source owner** and **destination owner** against on-chain `BlacklistEntry` PDAs.

If either party is blacklisted and the entry is `active = true`, the transfer reverts with `SourceBlacklisted` or `DestinationBlacklisted`. This enforcement is:
- **Unconditional** - it cannot be bypassed by the user.
- **Immediate** - takes effect in the same block as the `add_to_blacklist` transaction.
- **Universal** - applies to all wallets and programs attempting to transfer the token.

### DefaultAccountState: Frozen (optional)

When `default_account_frozen = true`, newly created token accounts start in the `Frozen` state. Users must have their account explicitly thawed (via KYC or whitelisting) before they can receive or transfer tokens. This is used by issuers who require affirmative onboarding before any token access.

---

## Roles

SSS-2 includes all SSS-1 roles plus:

### Blacklister

Granted via `add_role` with `role = Blacklister`. Allows the holder to:
- `add_to_blacklist(target, reason)` - create or reactivate a `BlacklistEntry` PDA
- `remove_from_blacklist(target)` - deactivate a `BlacklistEntry` PDA

Blacklister is typically assigned to an automated compliance pipeline that subscribes to OFAC SDN list updates.

### Seizer

Granted via `add_role` with `role = Seizer`. Allows the holder to:
- `seize(from, to, amount)` - forcibly transfer tokens using the permanent delegate

Seizer should be restricted to a compliance officer or multi-sig that acts on court orders or regulatory directives. In most operations, freezing the account is sufficient; seizure is reserved for final enforcement.

---

## Instructions

SSS-2 inherits all SSS-1 instructions (see [SSS-1.md](SSS-1.md)). The following instructions are SSS-2 only.

### `initialize` (SSS-2 variant)

Same as SSS-1 `initialize`, but with:
- `enable_permanent_delegate = true`
- `enable_transfer_hook = true`
- `hook_program_id = 6XUKT63WZFKU8Lvgydv9XeczoigNhag1JtvqkmV7nf47`
- `default_account_frozen = true` (optional, for KYC-gated issuers)

After `initialize`, the SDK also calls `initialize_extra_account_meta_list` on the `transfer_hook` program to register the PDA derivation rules for the hook.

---

### `add_to_blacklist`

Creates a `BlacklistEntry` PDA for a target address. Immediately blocks all transfers to/from that address.

**Parameters:** `reason: String` (max 128 bytes)

**Accounts:**

| Account | Description |
|---|---|
| `authority` | Signer (master authority or Blacklister role) |
| `config` | Config PDA |
| `mint` | The mint (used as seed, not mutated) |
| `target` | Address to blacklist (wallet pubkey) |
| `blacklist_entry` | `BlacklistEntry` PDA to create (`[b"blacklist", mint, target]`) |
| `blacklister_role` | Optional RoleEntry PDA; required if caller is not master authority |
| `system_program` | System program |

**Behavior:**
1. Checks `enable_permanent_delegate || enable_transfer_hook` (`Sss2NotEnabled` if false).
2. Checks caller is master authority or holds active Blacklister role.
3. Validates `reason.len() <= 128`.
4. Creates `BlacklistEntry` PDA with `active = true`, `blacklisted_at = Clock::get()`, `blacklisted_by = caller`.
5. Emits `BlacklistUpdated { blacklisted: true }`.

**Re-blacklisting:** This instruction uses `init_if_needed` on the `blacklist_entry` account. If an address was previously blacklisted and then removed via `remove_from_blacklist` (which sets `active = false` but preserves the PDA), calling `add_to_blacklist` again reactivates the existing PDA with the new `reason` and a fresh `blacklisted_at` timestamp. No manual cleanup is needed between removals and re-additions.

**Effect:** On the next transfer involving `target` as source or destination owner, the `transfer_hook` program rejects the transfer.

**Errors:** `Sss2NotEnabled`, `Unauthorized`, `RoleInactive`, `StringTooLong`

---

### `remove_from_blacklist`

Deactivates an existing `BlacklistEntry`. Immediately unblocks transfers for the address.

**Parameters:** none

**Accounts:** `authority`, `config`, `mint`, `target`, `blacklist_entry`, `blacklister_role` (optional)

**Behavior:**
1. Checks SSS-2 is enabled.
2. Checks authorization.
3. Requires `blacklist_entry.active == true` (`NotBlacklisted` if already inactive).
4. Sets `blacklist_entry.active = false`. PDA is preserved.
5. Emits `BlacklistUpdated { blacklisted: false }`.

**Errors:** `Sss2NotEnabled`, `Unauthorized`, `RoleInactive`, `NotBlacklisted`

---

### `seize`

Forcibly transfers tokens from any account using the permanent delegate.

**Parameters:** `amount: u64`

**Accounts:**

| Account | Description |
|---|---|
| `authority` | Signer (master authority or Seizer role) |
| `config` | Config PDA (the permanent delegate) |
| `mint` | Token-2022 mint |
| `from` | Source token account (must be for this mint) |
| `to` | Destination token account (must be for this mint) |
| `seizer_role` | Optional RoleEntry PDA |
| `token_program` | Token-2022 program |

**Behavior:**
1. Checks `enable_permanent_delegate == true` (`NoPermanentDelegate` if false).
2. Checks `enable_permanent_delegate || enable_transfer_hook` (`Sss2NotEnabled` if both false).
3. Checks `amount > 0`.
4. Checks caller is master authority or holds active Seizer role.
5. CPIs `transfer_checked` on Token-2022 using config PDA as authority (permanent delegate). Token-2022 accepts this because config PDA is the registered permanent delegate.
6. Emits `TokensSeized`.

**Notes:**
- The `from` account does not need to be frozen for seizure to succeed.
- The transfer hook is NOT triggered for permanent delegate transfers (Token-2022 behavior).
- The `to` account must be a valid token account for the same mint.

**Errors:** `Sss2NotEnabled`, `NoPermanentDelegate`, `InvalidAmount`, `Unauthorized`, `RoleInactive`

---

## Blacklist Enforcement Flow

```
1. Compliance team receives OFAC SDN designation for wallet W.

2. Automated pipeline calls add_to_blacklist(W, "OFAC SDN <date>"):
   - BlacklistEntry PDA created for (mint, W) with active = true
   - Event BlacklistUpdated emitted and indexed

3. All subsequent transfers:
   - Where W is the source token account owner → rejected (SourceBlacklisted)
   - Where W is the destination token account owner → rejected (DestinationBlacklisted)
   - W cannot receive new tokens
   - W cannot send existing tokens

4. Optional: freeze_account(W's token account):
   - Adds a second enforcement layer (freeze authority)
   - W's account is now blocked by both the hook and the freeze flag

5. If court-ordered seizure is required:
   - Ensure W's account is identified and balance confirmed
   - seize(from=W_ata, to=compliance_treasury, amount=balance)
   - TokensSeized event emitted
   - Compliance treasury now holds the seized funds

6. Off-chain: file SAR, update internal audit log, report to FinCEN if required.
```

---

## Token Seizure Flow

Seizure uses the PermanentDelegate extension, which allows the config PDA to transfer tokens from any token account without the owner's consent or signature.

```
Seizure prerequisites:
- SSS-2 mint (enable_permanent_delegate = true)
- Caller holds Seizer role or is master authority
- A valid destination token account exists

Seizure does not require:
- Account to be frozen
- Account owner to be blacklisted (though this is typical)
- Any signature from the account owner

On-chain effects:
- Tokens move from `from` to `to`
- No hook enforcement (permanent delegate bypasses hook)
- TokensSeized event is emitted with seizer identity

Off-chain obligations (issuer responsibility):
- Log the seizure with legal authorization reference
- Report to applicable regulatory authority
- Maintain records per applicable jurisdiction
```

---

## GENIUS Act Alignment

| GENIUS Act Requirement | SSS-2 Mechanism |
|---|---|
| Ability to freeze accounts | `freeze_account` via config PDA (freeze authority) |
| Ability to seize assets | `seize` via config PDA (permanent delegate) |
| Sanctions screening | Transfer hook blocks blacklisted addresses on every transfer |
| Blacklisting | `BlacklistEntry` PDA; immediate enforcement via hook |
| Audit trail | On-chain events (`BlacklistUpdated`, `TokensSeized`, `AccountFrozen`) |
| AML compliance | Off-chain indexer subscribes to events; SAR filing process |
| Secondary market monitoring | Transfer hook executes on every peer-to-peer transfer |
| Redemption capability | `burn` instruction; authority-controlled |
| Reserve attestation | Off-chain obligation of the issuer |

See [COMPLIANCE.md](COMPLIANCE.md) for detailed analysis of each requirement.

---

## On-Chain Enforcement Guarantees

The following properties are enforced unconditionally by the Token-2022 runtime and the `sss_token` program. They cannot be bypassed by any user, wallet, or program:

1. **Transfer blocking** - Any transfer involving a blacklisted owner (source or destination) will fail, including transfers routed through DEXes, bridges, or other protocols, as long as those protocols use the standard SPL transfer interface.

2. **Seizure capability** - The config PDA can move tokens from any account. The only way to prevent seizure of specific tokens is to hold them in an account where the token mint is different (i.e., unwrapped).

3. **Freeze authority** - No token account for this mint can be unfrozen without the config PDA's signature, which requires going through the `sss_token` program.

4. **Immutable extensions** - The extension set (permanent delegate, transfer hook) cannot be removed after initialization.

**Important limitation:** These guarantees apply at the token account level on Solana. They do not prevent an individual from holding the underlying fiat collateral or moving value through other on-chain assets not governed by this mint.

---

## Events (SSS-2 additions)

| Event | Fields | Trigger |
|---|---|---|
| `BlacklistUpdated` | `mint, address, blacklisted, reason, timestamp` | `add_to_blacklist`, `remove_from_blacklist` |
| `TokensSeized` | `mint, from, to, amount, seizer, timestamp` | `seize` |

Plus all SSS-1 events.

---

## Error Codes (SSS-2 additions)

| Code | Name | Message |
|---|---|---|
| 6007 | `Blacklisted` | Address is blacklisted |
| 6008 | `NotBlacklisted` | Address is not blacklisted |
| 6009 | `Sss2NotEnabled` | This instruction requires SSS-2 configuration |
| 6010 | `NoPermanentDelegate` | Permanent delegate not configured |
| 6011 | `NoTransferHook` | Transfer hook not configured |

Plus all SSS-1 error codes.

---

## Use Cases

- **Payment stablecoins** - USD-backed stablecoins issued by regulated entities with FinCEN MSB or state money transmitter licenses.
- **GENIUS Act compliant issuers** - Stablecoin issuers subject to federal payment stablecoin regulation.
- **CBDC pilots** - Central bank digital currency experiments requiring granular compliance controls.
- **Institutional settlement** - Inter-bank or institutional token networks with AML/KYC requirements.
- **Regulated asset tokenization** - Tokenized securities or regulated financial instruments requiring transfer restrictions.
