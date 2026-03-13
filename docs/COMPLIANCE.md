# Compliance Guide

Regulatory considerations and audit trail design for SSS-2 compliant stablecoins.

## Compliance Architecture

SSS-2 provides **on-chain enforcement** — compliance isn't optional once enabled. The transfer hook checks every transfer against the blacklist, and the permanent delegate allows token seizure.

### On-Chain vs Off-Chain

| Layer | Responsibility |
|-------|---------------|
| **On-chain** | Blacklist enforcement (transfer hook), token seizure (permanent delegate), freeze/thaw |
| **Off-chain** | Sanctions screening (OFAC/SDN), KYC/KYB verification, audit trail export, monitoring |

The program handles enforcement. Your compliance team handles _who_ to enforce against.

## Sanctions Screening Integration

The SDK provides hooks for integrating with sanctions screening providers:

```
1. User submits mint/transfer request
2. Backend checks address against sanctions lists (OFAC, EU, UN)
3. If flagged → call stable.compliance.blacklistAdd(address, reason)
4. If compliant → proceed with operation
```

### Integration Points

| Provider | Type | Integration |
|----------|------|-------------|
| Chainalysis | API | Pre-transaction screening |
| Elliptic | API | Wallet risk scoring |
| TRM Labs | API | On-chain analytics |
| OFAC SDN | CSV/API | Direct list check |

## Audit Trail

### On-Chain Events

Every compliance action emits an Anchor event:

```
AddressBlacklisted { mint, address, reason, blacklisted_by }
AddressUnblacklisted { mint, address }
TokensSeized { mint, from, treasury, amount }
AccountFrozen { mint, account }
AccountThawed { mint, account }
```

### Export Format

Use `sss-token audit-log` to export recent transactions. For full audit trail export, query the config PDA's transaction history:

```typescript
const sigs = await connection.getSignaturesForAddress(configPda, {
  limit: 1000,
});
```

### Recommended Audit Fields

| Field | Source |
|-------|--------|
| Timestamp | `blockTime` from transaction |
| Action | Event type (mint, burn, freeze, blacklist) |
| Actor | Signer public key |
| Target | Affected address |
| Amount | Token amount (if applicable) |
| Reason | Blacklist reason string |
| Tx Signature | On-chain proof |

## GENIUS Act Considerations

For stablecoins targeting US regulatory compliance under the proposed GENIUS Act:

1. **Reserve transparency** — Use the oracle module for real-time reserve attestation
2. **Blacklist capability** — SSS-2 provides on-chain blacklist enforcement
3. **Seizure authority** — Permanent delegate enables law enforcement cooperation
4. **Audit trail** — All actions are on-chain with timestamps and actor identification
5. **Pause mechanism** — Global pause for emergency quarantine

## Role Separation

For regulatory compliance, separate these keys across different teams:

| Role | Team | Purpose |
|------|------|---------|
| Master Authority | C-suite / Multi-sig | Full control, recovery |
| Minter | Treasury ops | Day-to-day minting |
| Burner | Treasury ops | Redemption processing |
| Pauser | Risk / Compliance | Emergency stop |
| Blacklister | Compliance | Sanctions enforcement |
| Seizer | Legal / Compliance | Asset recovery |

> **Recommendation**: Use a Squads multisig for the master authority.
