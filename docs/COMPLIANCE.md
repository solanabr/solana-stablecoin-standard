# SSS-2 Compliance Operations

## Overview

SSS-2 tokens enable regulatory compliance for stablecoin issuers through two
on-chain mechanisms:

- **Blacklist enforcement via transfer hook** — The hook program is invoked on
  every Token-2022 transfer. It checks whether a `BlacklistEntry` PDA exists
  for either the sender or receiver. If the PDA exists (lamports > 0), the
  transfer is rejected. No deserialization is performed; the lamport check is
  sufficient.

- **Asset seizure via permanent delegate** — SSS-2 mints are initialized with
  the Token-2022 `PermanentDelegate` extension set to the `StablecoinConfig`
  PDA. This allows the program to move tokens from any account without the
  token owner's signature, satisfying court orders and regulatory directives.

These features are only available on tokens initialized with
`enablePermanentDelegate = true` (the SSS-2 preset). Calling compliance
methods on an SSS-1 token will return `SSSError::ComplianceNotEnabled`.

---

## Regulatory Context

| Regulatory requirement | SSS-2 mechanism |
|------------------------|-----------------|
| OFAC address screening | `add_to_blacklist` creates a `BlacklistEntry` PDA; transfer hook blocks outbound and inbound transfers |
| AML transaction monitoring | On-chain events (`BlacklistAdded`, `TokensSeized`) feed compliance audit trails |
| Asset freezing | Standard Token-2022 freeze via freeze authority |
| Asset seizure | `seize` instruction using permanent delegate; no owner signature required |
| Sanctions list removal | `remove_from_blacklist` closes the PDA; address can transact again |

---

## Blacklist Operations

### `add_to_blacklist`

Creates a `BlacklistEntry` PDA with seeds
`[BLACKLIST_SEED, mint, address]`. Once the account exists, the transfer
hook rejects any transfer where source or destination matches the address.

**Required authority:** `blacklister` must be the `StablecoinConfig.authority`
or appear in `RoleManager.blacklisters`.

**Validation:**
- `StablecoinConfig.enable_permanent_delegate` must be `true`
- `reason` must not exceed `MAX_REASON_LEN` (64 bytes)

**Fields written to `BlacklistEntry`:**

| Field | Value |
|-------|-------|
| `address` | The wallet being blacklisted |
| `stablecoin` | The `StablecoinConfig` PDA key |
| `reason` | Caller-supplied string |
| `blacklisted_at` | `Clock::unix_timestamp` at instruction time |
| `blacklisted_by` | Blacklister's public key |
| `bump` | PDA canonical bump |

### `remove_from_blacklist`

Closes the `BlacklistEntry` PDA with `close = blacklister`, returning rent
lamports to the blacklister. Once closed, the address can send and receive
tokens again.

**Required authority:** Same as `add_to_blacklist`.

### How the transfer hook blocks transfers

The hook program derives
`[BLACKLIST_SEED, mint, source_authority]` and
`[BLACKLIST_SEED, mint, recipient_owner]` during `execute`. It checks
`account_info.lamports() > 0` on each PDA. A non-zero lamport count means
the account exists and the address is blacklisted — no deserialization
required. This keeps the hook cheap and avoids deserialization errors on
accounts with unexpected data.

---

## Seizure Operations

### `seize` instruction flow

1. **Authorization check** — `seizer` must be `StablecoinConfig.authority` or
   in `RoleManager.seizers`. `enable_permanent_delegate` must be `true`.

2. **Frozen check** — `source_token_account.is_frozen()` must return `true`.
   Seizure of unfrozen accounts is rejected with `SSSError::AccountNotFrozen`.
   Freeze the account first using the standard freeze authority.

3. **Thaw** — The program thaws the source account via CPI, signing with the
   `StablecoinConfig` PDA signer seeds. Token-2022 rejects transfers from
   frozen accounts even when a permanent delegate is used.

4. **Transfer** — `invoke_transfer_checked` is called with the
   `StablecoinConfig` PDA as the transfer authority (permanent delegate).
   Remaining accounts supply the transfer hook's extra account metas so the
   hook can validate the seizure path.

5. **Re-freeze** — The source account is frozen again immediately after
   transfer, ensuring it remains locked after the seizure completes.

6. **Event emission** — `TokensSeized` is emitted on-chain.

### SDK usage

```typescript
// fromTokenAccount must be frozen before calling seize
const sig = await compliance.seize(
  seizerKeypair,
  fromTokenAccount,
  treasuryTokenAccount,
  BigInt(1_000_000) // raw token units
);
```

The SDK automatically resolves the destination account owner and constructs
the five remaining accounts required by the transfer hook:
`[HOOK_PROGRAM_ID, extraAccountMetaList, sssToken.programId,
senderBlacklistPda, recipientBlacklistPda]`.

---

## Role Separation

| Role | Capabilities | Stored in |
|------|-------------|-----------|
| `StablecoinConfig.authority` (master) | All compliance operations | `StablecoinConfig` |
| Blacklister | `add_to_blacklist`, `remove_from_blacklist` | `RoleManager.blacklisters` |
| Seizer | `seize` | `RoleManager.seizers` |

Roles are managed via `RoleManager` PDA with seeds
`[ROLES_SEED, stablecoin_config]`. The master authority can assign or revoke
roles without holding them itself. Separating blacklister and seizer roles
limits blast radius: a compromised blacklister key cannot seize funds.

---

## Audit Trail: On-Chain Events

All compliance actions emit Anchor events that are logged in the transaction
and indexable by event discriminator.

### `BlacklistAdded`

```rust
pub struct BlacklistAdded {
    pub mint: Pubkey,       // The stablecoin mint
    pub address: Pubkey,    // Address added to the blacklist
    pub reason: String,     // Human-readable reason (max 64 chars)
    pub by: Pubkey,         // Blacklister who executed the instruction
    pub timestamp: i64,     // Unix timestamp from Clock
}
```

### `BlacklistRemoved`

```rust
pub struct BlacklistRemoved {
    pub mint: Pubkey,       // The stablecoin mint
    pub address: Pubkey,    // Address removed from the blacklist
    pub by: Pubkey,         // Blacklister who executed the instruction
}
```

### `TokensSeized`

```rust
pub struct TokensSeized {
    pub mint: Pubkey,       // The stablecoin mint
    pub from: Pubkey,       // Source token account key
    pub to: Pubkey,         // Destination (treasury) token account key
    pub amount: u64,        // Raw token units transferred
    pub by: Pubkey,         // Seizer who executed the instruction
}
```

These events can be consumed by subscribing to program logs or by the
indexer service (see `API.md`, port 3002).

---

## Integration Pattern: Sanctions Screening

```
Sanctions API (OFAC/Chainalysis/Elliptic)
        |
        | poll or webhook on new transaction / address
        v
Compliance Service (port 3003)
  POST /api/v1/screen  →  { blacklisted: true, reason: "OFAC SDN match" }
        |
        | if blacklisted
        v
  POST /api/v1/blacklist  →  calls add_to_blacklist on-chain
        |
        v
  Indexer (port 3002) picks up BlacklistAdded event
  Webhook fired to downstream risk system
```

For real-time coverage, configure the sanctions provider to POST a webhook
to your compliance service on any match. The service then calls
`ComplianceModule.addToBlacklist` with the flagged address and the provider's
match reason.

---

## Operational Checklist: OFAC Match to Seizure

1. **Receive OFAC match** — Sanctions provider identifies a wallet holding
   your stablecoin on the SDN list.

2. **Blacklist address** — Call `add_to_blacklist(address, reason)`. Transfer
   hook begins rejecting transfers immediately on the next block.

3. **Freeze token account** — Use the freeze authority to freeze the
   holder's token account. This is a prerequisite for seizure.

4. **Verify freeze** — Confirm `source_token_account.is_frozen() == true`
   on-chain before proceeding.

5. **Execute seizure** — Call `seize(fromTokenAccount, treasuryAccount, amount)`.
   The instruction thaws, transfers, and re-freezes atomically.

6. **Confirm on-chain** — Verify the `TokensSeized` event in the transaction
   logs at confirmed commitment.

7. **Export audit report** — Use `GET /api/v1/audit/export?mint=...&format=csv`
   to produce a timestamped record for regulatory filing.

---

## Limitations

- **On-chain enforcement only** — Blacklisting prevents token transfers on
  Solana but does not affect balances on other chains or off-chain records.
  Cross-chain bridged assets require separate enforcement at the bridge layer.

- **Permanent delegate is irrevocable per token** — The `PermanentDelegate`
  extension is set at mint initialization and cannot be removed. SSS-2 tokens
  carry this property for their entire lifetime.

- **Blacklist does not auto-freeze** — Adding an address to the blacklist
  blocks future transfers but does not freeze existing token accounts. A
  separate freeze instruction must be executed before seizure is possible.

- **Reason string is public** — The `reason` field is written on-chain and
  visible to anyone. Do not include personally identifiable information; use
  opaque case identifiers instead (e.g., `"OFAC-2026-00142"`).
