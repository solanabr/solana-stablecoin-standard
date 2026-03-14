# SSS-2: Compliant Stablecoin Standard

**Status:** Final  
**Version:** 1.0.0

---

## Abstract

SSS-2 is a superset of SSS-1. It adds proactive on-chain compliance: a blacklist enforced at the protocol layer on every transfer via a transfer hook, and the ability to seize tokens from sanctioned addresses via a permanent delegate.

SSS-2 targets USDC/USDT-class tokens where:
- Regulators expect on-chain blacklist enforcement
- The issuer must be able to freeze AND seize tokens from sanctioned addresses
- Every transfer must be checked against the blacklist — no gaps

SSS-2 is appropriate for:
- Regulated payment stablecoins under the GENIUS Act or equivalent
- Institution-grade tokens with sanctions screening obligations
- Cross-border payment stablecoins subject to OFAC/FATF requirements

---

## Specification

### Required Token-2022 Extensions

All SSS-1 extensions, plus:

| Extension | Required | Notes |
|---|---|---|
| PermanentDelegate | YES | Enables token seizure without user signature |
| TransferHook | YES | Enforces blacklist on every transfer |

### Required Program Features

All SSS-1 instructions, plus:

**Compliance instructions:**
- `add_to_blacklist(reason: String)` — creates a `BlacklistEntry` PDA for the target address
- `remove_from_blacklist(reason: String)` — closes the `BlacklistEntry` PDA (returns lamports)
- `seize()` — uses permanent delegate to move all tokens from target to treasury

**Additional roles:**
- `blacklister` — can add/remove addresses from the blacklist
- `seizer` — can seize tokens from blacklisted accounts

**Feature gating:** All SSS-2 instructions must fail with `ComplianceNotEnabled` if the token was initialized as SSS-1. This is enforced by checking `state.compliance_enabled` at the start of each instruction.

### Blacklist Mechanism

The blacklist is implemented as on-chain PDAs with the seed `["blacklist", state_pubkey, target_wallet]`.

**Why PDAs?**
- Existence of the account = blacklisted
- Closure of the account (lamports returned to blacklister) = removed
- The transfer hook only needs to check if the PDA exists — an O(1) account lookup per transfer
- No central list to iterate or scan

**Blacklist enforcement is zero-gap.** The transfer hook is registered in the mint's `TransferHook` extension. Token-2022 calls it on every `transfer_checked` instruction. There is no way to transfer tokens without the hook executing.

### Seize Mechanism

Seizure uses the `PermanentDelegate` extension. The permanent delegate PDA (`["permanent_delegate", state]`) has authority over all token accounts holding this mint, regardless of the account owner's signature.

Seizure flow:
1. Caller calls `seize(from, treasury)`
2. Program verifies `from` has an active `BlacklistEntry` PDA
3. Program verifies caller is `seizer` or `master_authority`
4. Program uses permanent delegate PDA (via `invoke_signed`) to transfer all tokens from `from` to `treasury`
5. `TokensSeized` event emitted

### Transfer Hook

The transfer hook program (`transfer-hook`) is a separate on-chain program. It receives all token transfer attempts and:

1. Checks if a `BlacklistEntry` PDA exists for the source wallet → reject with `SenderBlacklisted`
2. Checks if a `BlacklistEntry` PDA exists for the destination wallet → reject with `RecipientBlacklisted`
3. If neither exists → allow transfer

The extra account meta list (`["extra-account-metas", mint]`) tells Token-2022 which additional accounts to resolve and pass to the hook program on every transfer.

### Compliance Lifecycle

```
1. New address identified (manual review, Chainalysis API, etc.)
   ↓
2. add_to_blacklist(address, reason="OFAC match")
   → BlacklistEntry PDA created
   → AddressBlacklisted event emitted
   ↓
3. All transfers from/to address now blocked by transfer hook
   ↓
4. freeze_account(address)   ← optional but recommended
   → Account frozen (belt-and-suspenders with the hook)
   ↓
5. seize(address, treasury)
   → All tokens moved to treasury
   → TokensSeized event emitted
   ↓
6. [Case resolved]
   remove_from_blacklist(address, reason="Cleared")
   → BlacklistEntry PDA closed
   → Transfers allowed again
```

### Audit Trail

All compliance actions emit on-chain events:
- `AddressBlacklisted { mint, address, reason, blacklister, timestamp }`
- `AddressUnblacklisted { mint, address, reason, blacklister, timestamp }`
- `TokensSeized { mint, from, to, amount, seizer, timestamp }`
- `AccountFrozen / AccountThawed { mint, account, authority, timestamp }`

These are indexed by the event-listener service and stored in the compliance service's audit log.

### Reference Implementation

```typescript
import { SolanaStablecoin, Preset } from "solana-stablecoin-sdk";

const stable = await SolanaStablecoin.create({
  connection,
  preset: Preset.SSS_2,
  name: "Regulated USD",
  symbol: "RUSD",
  decimals: 6,
  authority: adminKeypair,
});

// Compliance operations
await stable.compliance.blacklistAdd(suspiciousAddress, "OFAC SDN match");
await stable.freeze(suspiciousAddress);
await stable.compliance.seize(suspiciousAddress, treasuryAddress);

// Removal
await stable.compliance.blacklistRemove(suspiciousAddress, "False positive — cleared");
```

Or via CLI:

```bash
sss-token init --preset sss-2 --name "Regulated USD" --symbol "RUSD"
sss-token blacklist add <ADDRESS> --reason "OFAC match"
sss-token freeze <ADDRESS>
sss-token seize <ADDRESS> --to <TREASURY>
sss-token blacklist remove <ADDRESS> --reason "Cleared"
```

## Regulatory Considerations

See [COMPLIANCE.md](./COMPLIANCE.md) for a full discussion of regulatory considerations including GENIUS Act alignment, OFAC/FATF obligations, and audit trail requirements.

## Security Considerations

- The `seizer` role should be assigned to a multisig requiring at least 2-of-3 senior compliance officers.
- The `blacklister` role may be assigned to an automated compliance system for speed, but all blacklist actions should be logged and reviewable.
- The permanent delegate PDA has authority over all token accounts — its seed is deterministic but it is a PDA, so it is not controlled by any single private key.
- Remove addresses from the blacklist promptly after a case is resolved — unnecessary blacklist entries waste lamports and add noise to the audit trail.