# Compliance Guide

## Regulatory Context

SSS-2 is designed with regulated stablecoin issuers in mind. Key regulatory requirements this addresses:

### GENIUS Act (US) / Stablecoin Regulation

The emerging US framework expects:
- **Asset seizure capability** — ability to freeze and recover tokens from sanctioned actors
- **Blacklist enforcement** — prevent sanctioned addresses from sending or receiving tokens
- **Audit trail** — complete log of all compliance actions

### FATF / AML Standards

- **KYC gating** — SSS-2's default frozen state requires operators to explicitly onboard each user
- **Transaction monitoring** — the compliance service provides a webhook notification system
- **Record keeping** — all blacklist additions/removals are logged on-chain and off-chain

## On-Chain Blacklist

The blacklist is enforced at the protocol level — it cannot be bypassed:

1. When `add_to_blacklist` is called, a `BlacklistEntry` PDA is created at `["blacklist", mint, address]`
2. On every token transfer, the `sss-transfer-hook` program checks both sender and recipient against their blacklist PDAs
3. If either PDA exists (has lamports), the transfer is rejected with `SenderBlacklisted` or `RecipientBlacklisted`

The blacklist PDA check happens inside the Token-2022 protocol — even direct SPL token transfers through other programs will fail.

## Two-Step Seize Process

Seizure requires two separate transactions to prevent accidents:

```
Step 1: freeze_account  -- operator freezes the account
Step 2: seize           -- seizer moves tokens to treasury
```

Requiring a separate freeze step means:
- No accidental seize from an unfrozen account
- Clear audit trail with two on-chain events
- Different roles can control freeze vs. seize

## Audit Trail Format

All compliance actions emit both on-chain events and off-chain audit log entries:

```json
{
  "action": "blacklist_add_approved",
  "id": "uuid",
  "address": "pubkey",
  "reason": "OFAC SDN match",
  "operator": "officer_pubkey",
  "ts": "2026-03-12T10:00:00.000Z"
}
```

Export to CSV for regulatory reporting:
```bash
curl http://localhost:3003/api/audit/export > audit-$(date +%Y%m%d).csv
```

## Sanctions Screening Integration

The compliance service has a `/api/screening/check` endpoint that is currently mocked. To connect to a real provider:

1. Set `SCREENING_API_KEY` and `SCREENING_PROVIDER` environment variables
2. Implement the provider adapter in `services/compliance/src/routes/screening.ts`

Supported providers (via community adapters):
- Chainalysis KYT
- Elliptic Navigator
- TRM Labs

## Pending Review Queue

The compliance service implements a two-phase approval for blacklist additions:

1. Operator submits `POST /api/blacklist/add` — creates a `pending_review` entry
2. Senior compliance officer reviews and calls `POST /api/blacklist/:id/approve`
3. Service submits the on-chain transaction

This prevents a single compromised key from blacklisting addresses without oversight.

## On-Chain Event Reference

All compliance-relevant events:

| Event | Emitted By | Data |
|-------|-----------|------|
| `AddressBlacklisted` | `add_to_blacklist` | mint, address, blacklister, reason, timestamp |
| `AddressRemovedFromBlacklist` | `remove_from_blacklist` | mint, address, blacklister, timestamp |
| `TokensSeized` | `seize` | mint, from, to, seizer, amount, timestamp |
| `AccountFrozen` | `freeze_account` | mint, account, authority, timestamp |
| `AccountThawed` | `thaw_account` | mint, account, authority, timestamp |
