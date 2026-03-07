# Compliance Guide

## Overview

SSS-2 is designed to meet the compliance requirements expected of regulated stablecoins. This document describes the compliance architecture, regulatory considerations, and audit trail format.

## Regulatory Context

The [GENIUS Act](https://en.wikipedia.org/wiki/GENIUS_Act) and similar legislation establish requirements for payment stablecoin issuers, including:

1. **Sanctions screening** — Issuers must screen transactions against OFAC SDN and similar lists
2. **Transaction blocking** — Blocked parties must be prevented from sending or receiving tokens
3. **Asset seizure** — Law enforcement-ordered seizures must be executable
4. **Audit trail** — All compliance actions must be logged with reason, operator, and timestamp

SSS-2 addresses each of these:

| Requirement | SSS-2 Implementation |
|-------------|---------------------|
| Sanctions screening | Screening happens off-chain; blacklisting is on-chain |
| Transaction blocking | Transfer hook checks BlacklistEntry PDA on every transfer |
| Asset seizure | `seize` instruction via permanent delegate |
| Audit trail | On-chain events + compliance service SQLite/Postgres log |

## On-chain Audit Trail

Every compliance action emits an Anchor event:

```
BlacklistAdded  { mint, address, reason, by }
BlacklistRemoved { mint, address, by }
TokensSeized    { mint, from, to, amount, by }
AccountFrozen   { mint, token_account, by }
AccountThawed   { mint, token_account, by }
```

These events are:
- Permanently stored in transaction logs on-chain (immutable)
- Decoded and stored in the compliance service SQLite database
- Exportable via `GET /audit-log` or `sss-token audit-log`

## Audit Log Format

```json
{
  "id": 42,
  "action": "blacklist_add",
  "address": "7vFxxx...abc",
  "reason": "OFAC SDN match — XYZ Corporation",
  "operator": "AuthorityPubkey...",
  "signature": "5Rexxx...transaction_sig",
  "timestamp": "2026-03-05T14:23:11Z"
}
```

Actions: `blacklist_add`, `blacklist_remove`, `seize`, `freeze`, `thaw`

## Sanctions Screening Integration

The compliance service provides an integration point for external screening:

```
Fiat onramp / off-ramp system
    ↓
Sanctions screening API (OFAC, Chainalysis, Elliptic, etc.)
    ↓
POST /blacklist/add  ←── compliance service
    ↓
sss-token program (on-chain)
    ↓
BlacklistEntry PDA created
    ↓
Transfer hook enforces on every subsequent transfer
```

The SSS compliance service does not bundle a specific sanctions database — issuers plug in their preferred provider.

## Blacklist Mechanics

**Why PDA existence vs. stored flag:**

BlacklistEntry PDAs are cheap to check (just `data.len() > 0`) inside the transfer hook's hot path. No deserialization is needed. This minimizes compute units and transfer latency.

**Permanent enforcement:**
Once a `BlacklistEntry` PDA exists, it is enforced on 100% of transfers — there are no front-running windows, MEV-based bypasses, or timing gaps.

**Rent:**
Each `BlacklistEntry` costs ~0.0023 SOL in rent. Rent is reclaimed to the blacklister when the entry is removed via `close = blacklister` in the Anchor account constraint.

## Key Management Recommendations

| Role | Recommendation |
|------|---------------|
| Master authority | Hardware wallet or multi-sig (Squads) |
| Blacklister | Dedicated key, rotated quarterly |
| Seizer | Hardware wallet, requires 2-of-N approval process |
| Pauser | Dedicated key, on-call operator |

**Never store role keypairs on the same machine as the indexer or compliance services.**

## Disclaimer

This software is provided as-is under the MIT license. It does not constitute legal advice. Issuers are responsible for ensuring their stablecoin operations comply with applicable laws and regulations in their jurisdiction. Consult qualified legal counsel before deploying a stablecoin for public use.
