# Compliance Guide

This document describes how SSS-2 addresses regulatory requirements for payment stablecoin issuers, with a focus on the GENIUS Act (Guiding and Establishing National Innovation for US Stablecoins Act) and OFAC sanctions compliance.

---

## GENIUS Act Requirements

The GENIUS Act establishes a federal framework for permitted payment stablecoin issuers. Key technical requirements relevant to on-chain implementation:

| GENIUS Act Requirement | SSS-2 Mechanism | Implementation Detail |
|---|---|---|
| Freeze / block accounts | `freeze_account` instruction | Config PDA holds freeze authority; Freezer role or master authority required |
| Seize assets | `seize` instruction | Config PDA as permanent delegate; Seizer role or master authority required |
| Sanctions compliance (OFAC) | `add_to_blacklist` + transfer hook | Blacklist entry blocks all transfers immediately and unconditionally |
| Prohibition on blocked parties | Transfer hook enforcement | Token-2022 calls hook on every transfer; no bypass possible via standard SPL interface |
| Redemption capability | `burn` instruction | Authority-controlled redemption at any time |
| Audit trail | On-chain events | All compliance actions emit structured events; indexed by the indexer service |
| AML program | Off-chain obligation + webhook | Indexer emits webhooks; issuer integrates with BSA/AML compliance software |
| Reserve requirements | Off-chain obligation | Off-chain reserve attestation; not enforced on-chain |
| Monthly attestation | Off-chain obligation | Public reserve reporting; references mint supply via `getTotalSupply` |

---

## Freeze Authority vs. Permanent Delegate

These are two distinct capabilities with different enforcement mechanisms:

### Freeze Authority

- **What it does:** Marks a token account as frozen. A frozen account cannot send or receive transfers via the standard SPL `transfer` / `transfer_checked` instructions.
- **Who holds it:** The config PDA for SSS-2 mints.
- **How to invoke:** `freeze_account` instruction in `sss_token`. Requires Freezer role or master authority.
- **Effect:** Bidirectional block - the account can neither send nor receive.
- **Reversible:** Yes, via `thaw_account`.
- **Availability:** SSS-1 and SSS-2.

### Permanent Delegate

- **What it does:** Grants the config PDA the right to transfer tokens out of any account associated with this mint, without the account owner's signature.
- **Who holds it:** The config PDA for SSS-2 mints.
- **How to invoke:** `seize` instruction in `sss_token`. Requires Seizer role or master authority.
- **Effect:** Unilateral transfer - tokens move from the target account to any designated destination.
- **Reversible:** No (tokens are moved; a reverse transfer would require a new seize).
- **Availability:** SSS-2 only.

### When to Use Each

| Scenario | Freeze | Seize |
|---|---|---|
| Initial OFAC designation | Yes (immediately block activity) | Only if ordered |
| Pending investigation | Yes | No |
| Court-ordered forfeiture | Yes + then Seize | Yes |
| Voluntary redemption hold | Yes | No |
| Regulatory directive | Depends on directive | Depends on directive |

The standard OFAC compliance workflow is: **blacklist first** (blocks transfers via hook), then **freeze** (second enforcement layer), then **seize** only if a court order or regulatory directive requires asset transfer.

---

## OFAC Sanctions Screening Integration

### Architecture

```
OFAC SDN / OFAC Consolidated Lists
          |
          v
Compliance screening service
(issuer's existing AML software or custom integration)
          |
          v  [when match detected]
POST /v1/compliance/blacklist
          |
          v
compliance-service → SolanaStablecoin.compliance.blacklistAdd()
          |
          v
add_to_blacklist instruction → BlacklistEntry PDA (active = true)
          |
          v
transfer_hook enforces on every transfer
```

### Screening Points

- **At onboarding (KYC):** Screen wallet address before allowing token receipt. For SSS-2 with `default_account_frozen = true`, new accounts require manual thaw after KYC clearance.
- **Periodic rescreening:** Issuers should periodically rescreen all known wallet addresses against updated OFAC lists. The blacklist API supports adding addresses at any time.
- **Transaction monitoring:** The indexer emits `TokensMinted`, `TokensBurned`, and transfer events via webhook. Integrate these with your transaction monitoring system.

### SDN List Update Process

When OFAC publishes an SDN list update:

1. Your screening system detects new entries matching known wallet addresses.
2. For each matched wallet:
   - `POST /v1/compliance/blacklist` with `{ mint, address, reason: "OFAC SDN YYYY-MM-DD" }`
   - Optionally: `POST /v1/compliance/blacklist` via the compliance service, which will also freeze the account.
3. Emit an internal alert to your compliance officer.
4. Document the action in your AML records.

**Re-blacklisting previously removed addresses:** If an address was previously blacklisted and later removed (e.g., due to an erroneous match or a subsequent de-listing), it can be re-blacklisted by calling `add_to_blacklist` again without any special handling. The underlying `BlacklistEntry` PDA is preserved on removal (`active` is set to `false` but the account is not closed), and `add_to_blacklist` uses `init_if_needed`, so re-calling the instruction reactivates the existing PDA with the new reason and a fresh timestamp. This means the compliance pipeline can treat `add_to_blacklist` as idempotent for operational purposes.

---

## Audit Trail

### On-Chain Events

All compliance-relevant operations emit structured Anchor events, which are stored in transaction logs and can be indexed by any Solana archival node.

| Event | Compliance Relevance | Fields |
|---|---|---|
| `StablecoinInitialized` | Mint creation record | mint, authority, preset, timestamp |
| `TokensMinted` | Issuance record | mint, recipient, amount, minter, timestamp |
| `TokensBurned` | Redemption record | mint, from, amount, timestamp |
| `AccountFrozen` | Freeze/thaw record | mint, account, frozen, timestamp |
| `BlacklistUpdated` | Sanctions action record | mint, address, blacklisted, reason, timestamp |
| `TokensSeized` | Seizure record | mint, from, to, amount, seizer, timestamp |
| `AuthorityTransferred` | Control change record | mint, old_authority, new_authority, timestamp |
| `MinterUpdated` | Access change record | mint, minter, active, quota, timestamp |
| `RoleUpdated` | Role change record | mint, address, role, active, timestamp |

### Off-Chain Audit Log Format

The compliance service maintains an in-memory audit log (replace with a persistent database in production). Each entry:

```json
{
  "id": "blacklist-1709123456789",
  "mint": "<MINT_PUBKEY>",
  "action": "blacklisted",
  "address": "<WALLET_PUBKEY>",
  "reason": "OFAC SDN 2026-03-03",
  "performedBy": "<AUTHORITY_PUBKEY>",
  "signature": "<TRANSACTION_SIGNATURE>",
  "timestamp": "2026-03-03T12:00:00.000Z"
}
```

Valid `action` values: `blacklisted`, `unblacklisted`, `seized`, `frozen`, `minted`, `burned`.

Retrieve via `GET /v1/compliance/audit-log?mint=<mint>&action=<action>&limit=<n>`.

### Indexer Webhook Format

The indexer delivers real-time events to your compliance endpoint:

```json
{
  "event": "BlacklistUpdated",
  "data": {
    "mint": "<MINT_PUBKEY>",
    "address": "<WALLET_PUBKEY>",
    "blacklisted": true,
    "reason": "OFAC SDN match",
    "timestamp": 1709123456
  },
  "signature": "<TRANSACTION_SIGNATURE>",
  "timestamp": "2026-03-03T12:00:00.000Z"
}
```

Webhooks include an `X-SSS-Signature` header (SHA-256 HMAC of the payload, using `WEBHOOK_SECRET`). Verify this header before processing.

---

## SAR Filing Considerations

Suspicious Activity Reports (SARs) are an off-chain obligation. The `sss_token` program provides the data you need, but does not file SARs.

**Data available for SAR construction:**
- Complete on-chain transaction history for any wallet via the indexer
- Blacklist history (who was blacklisted, when, by whom, why)
- Seizure records
- Minting and burning history for the issuer

**SAR trigger events to monitor via webhook:**
- Large minting to a single wallet (> threshold)
- Rapid movement of tokens immediately after receipt
- Transfers to/from newly created wallets
- Blacklisting of a wallet that previously received large mints

---

## Secondary Market Monitoring via Transfer Hook

For SSS-2 mints, the transfer hook executes on **every** token transfer, including:
- DEX trades (Raydium, Orca, Jupiter aggregator)
- Bridge transfers
- OTC transfers
- Protocol deposits and withdrawals

This means secondary market activity is monitored at the protocol level, not just at the issuer's front-end. Any transfer involving a blacklisted address fails regardless of the platform used.

**Limitation:** The hook fires on transfers between existing token accounts. If a token is wrapped into a different SPL token (e.g., via a wrapper protocol), transfers of the wrapper token are not subject to this hook. Issuers should monitor for wrapping activity.

---

## Choosing Between SSS-1 and SSS-2

| Factor | SSS-1 | SSS-2 |
|---|---|---|
| Regulatory status | Not subject to GENIUS Act | GENIUS Act compliant |
| User experience | No hook overhead | Minor gas overhead per transfer (hook CPI) |
| Operational complexity | Minimal | Moderate (blacklist management, OFAC screening) |
| Token seizure risk for users | None | Yes (permanent delegate) |
| Target market | DAOs, ecosystems, internal use | Regulated payment stablecoins |
| Decentralization | Higher (no censorship mechanism) | Lower (issuer can block/seize) |

**Choose SSS-1 if:**
- You are a DAO or protocol issuing a governance or utility token.
- You have no regulatory obligation to block or seize assets.
- User trust depends on absence of censorship capability.

**Choose SSS-2 if:**
- You are or intend to become a permitted payment stablecoin issuer under the GENIUS Act.
- You have a legal obligation to implement OFAC sanctions screening.
- Your terms of service reserve the right to freeze or seize funds.
- You are issuing a USD-backed stablecoin for retail or institutional payment use.

---

## Confidentiality Considerations (SSS-3 Future Work)

All on-chain state in SSS-1 and SSS-2 is fully public. Anyone can read:
- Who is blacklisted and why
- The identity of all minters and their quotas
- The full history of compliance actions

For issuers who need confidential compliance (e.g., law enforcement hold without public disclosure), SSS-3 would leverage confidential transfer extensions or ZK-based approaches. This is future work not covered by the current standard.

If confidentiality is needed before SSS-3, a partial mitigation is to use generic reason strings (`"Compliance hold"` rather than `"OFAC SDN match"`), but the blacklisted address itself remains public.
