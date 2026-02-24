# Compliance Considerations

## Overview

SSS-2 is designed to meet the on-chain requirements of modern stablecoin regulation. This document discusses how SSS-2 aligns with current regulatory frameworks and what issuers need to implement beyond the on-chain program.

## GENIUS Act Alignment (U.S.)

The Guiding and Establishing National Innovation for U.S. Stablecoins (GENIUS) Act establishes a federal framework for payment stablecoins. Key requirements and how SSS-2 addresses them:

| Requirement | SSS-2 Feature |
|---|---|
| Ability to freeze accounts | `freeze_account` + `DefaultAccountState` extension |
| Ability to seize tokens from sanctioned parties | `seize` via `PermanentDelegate` |
| Sanctions screening (OFAC) | `add_to_blacklist` — enforced on every transfer via hook |
| Audit trail for compliance actions | `AuditLog` DB table + on-chain events |
| Redemption at par | Out-of-scope for on-chain program; must be implemented by issuer |
| Reserve reporting | Out-of-scope; issuer obligation |

Note: Legal analysis of GENIUS Act compliance requires a qualified attorney. This document is for technical reference only.

## OFAC/FATF Obligations

SSS-2's transfer hook enforces the blacklist on **every single transfer**. This is the technical control required to comply with OFAC's expectation that SDN-listed parties cannot use the payment rail at all — not just that the issuer refuses to service them directly, but that on-chain transfers involving them fail.

### Sanctions Screening Integration

The compliance service includes an integration point for the Chainalysis API (`CHAINALYSIS_API_KEY` environment variable). When set, each `POST /blacklist` request automatically screens the address for risk score before adding to the blacklist.

You may substitute any sanctions screening provider by replacing the `screenAddress` function in `services/compliance/src/index.ts`.

For issuers without a third-party screening vendor, the compliance service still accepts manual blacklist additions via the API.

## Audit Trail

Every compliance action is recorded in two places:

1. **On-chain events** — immutable, timestamped, publicly verifiable
   - `AddressBlacklisted { mint, address, reason, blacklister, timestamp }`
   - `AddressUnblacklisted { mint, address, reason, blacklister, timestamp }`
   - `TokensSeized { mint, from, to, amount, seizer, timestamp }`

2. **Off-chain database** — queryable, exportable
   - `audit_log` table in PostgreSQL
   - Full history of all actions: actor, target, amount, reason, tx signature

### Audit Log Export

```bash
# Via CLI
sss-token audit-log --limit 1000

# Via compliance API
curl http://localhost:3003/audit-log?limit=1000
curl http://localhost:3003/audit-log?action=blacklist_add
```

### Retention

The PostgreSQL database persists indefinitely. For regulatory retention requirements (typically 5-7 years for payment records), configure a backup strategy appropriate for your jurisdiction.

## Role Separation

Regulators typically require that no single person can both:
- Add to the blacklist AND seize tokens in one action

SSS-2 supports this by separating the `blacklister` and `seizer` roles. For regulated deployments:
- Assign `blacklister` to the compliance team
- Assign `seizer` to a separate, senior-level multisig
- The master authority should be a hardware-backed multisig (e.g., Squads Protocol on Solana)

## What SSS-2 Does NOT Cover

- **Reserve management** — Maintaining 1:1 backing is an off-chain operational obligation
- **Redemption** — The on-chain program mints and burns but has no knowledge of fiat flows
- **KYC/AML of initial recipients** — Must be performed off-chain by the issuer before calling `mint`
- **Travel Rule compliance** — Must be implemented at the issuer's API layer
- **Proof of reserves** — Must be published separately by the issuer

## Privacy Considerations

All on-chain actions are publicly visible on Solana. This includes:
- Blacklist entries (which wallets are blacklisted)
- Seizure transactions (amounts and recipient treasury)

For issuers operating in jurisdictions with strong privacy requirements, consider:
- Using intermediate addresses rather than end-user wallets directly
- Coordinating with legal counsel on whether on-chain blacklisting creates disclosure obligations
- SSS-3 (experimental) adds confidential transfers for privacy-preserving stablecoin flows

## Incident Response

In the event of a compliance incident:
1. **Identify** — Use `sss-token blacklist check <address>` or query the compliance API
2. **Contain** — `sss-token freeze <address>` immediately (prevents transfers)
3. **Enforce** — `sss-token blacklist add <address> --reason "..."` (blocks all future transfers even if thawed later)
4. **Escalate** — Notify legal and senior management
5. **Seize if required** — `sss-token seize <address> --to <treasury>` (requires seizer role)
6. **Document** — The audit log captures all actions automatically; supplement with internal incident report