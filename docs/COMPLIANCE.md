# Compliance Guide

## Overview

SSS-2 provides the on-chain primitives for regulatory compliance: blacklisting, transfer validation, and account seizure. The backend compliance service adds monitoring, alerting, and audit trails on top.

## On-Chain Compliance (SSS-2)

### Blacklist

The blacklist is an on-chain Vec of up to 256 Pubkeys stored in a PDA. Every transfer triggers the transfer hook, which checks both source and destination against this list.

**Adding to the blacklist:**
```bash
sss-token blacklist-add --mint <MINT> --address <BAD_ACTOR>
```

**Removing from the blacklist:**
```bash
sss-token blacklist-remove --mint <MINT> --address <ACTOR>
```

After an address is blacklisted:
- All outbound transfers from that address are blocked
- All inbound transfers to that address are blocked
- The account can still hold tokens (they're just immovable)
- A seizer can confiscate the tokens

### Seizure

Seizure moves tokens from a blacklisted account to a treasury account. The on-chain implementation uses burn+mint (not transfer) to avoid triggering the transfer hook:

1. Burns all tokens from the blacklisted account using the permanent delegate
2. Mints equivalent tokens to the designated treasury

Net effect: same total supply, but tokens move from the blocked account to treasury.

```bash
# Seize requires the target to be blacklisted first
sss-token seize --mint <MINT> --source <BAD_ACTOR_ATA> --treasury <TREASURY_ATA>
```

### Pause

Global pause blocks all mint, burn, and transfer operations. Use in emergencies:

```bash
sss-token pause --mint <MINT>
# ... investigate ...
sss-token unpause --mint <MINT>
```

## Off-Chain Compliance Service

The backend compliance service monitors on-chain events and generates alerts based on configurable rules.

### Default Rules

| Rule | Trigger | Severity |
|------|---------|----------|
| Large mint | Mint amount exceeds threshold | Info |
| Large burn | Burn amount exceeds threshold | Info |
| Seizure | Any seizure event | Critical |
| Pause/Unpause | Token paused or unpaused | Warning |

### Custom Rules

Add rules via the API:

```bash
curl -X POST http://localhost:4000/api/v1/compliance/rules \
  -H "Content-Type: application/json" \
  -d '{
    "id": "large-transfer",
    "type": "transfer",
    "threshold": "5000000000",
    "action": "alert",
    "enabled": true
  }'
```

### Alerts

View pending alerts:

```bash
curl http://localhost:4000/api/v1/compliance/alerts
```

Acknowledge an alert:

```bash
curl -X POST http://localhost:4000/api/v1/compliance/alerts/<ALERT_ID>/acknowledge
```

### Webhook Integration

Register a webhook to receive real-time compliance events:

```bash
curl -X POST http://localhost:4000/api/v1/webhooks \
  -H "Content-Type: application/json" \
  -d '{
    "id": "compliance-alerts",
    "url": "https://your-service.com/webhooks/sss",
    "events": ["seize", "blacklist", "pause"],
    "secret": "your-hmac-secret"
  }'
```

Webhook payloads include an `X-SSS-Signature` header with an HMAC-SHA256 signature of the payload body, computed with the subscription's secret.

## OFAC/Sanctions Compliance Workflow

A typical workflow for OFAC compliance:

1. **Screening**: External service screens wallet addresses against OFAC SDN list
2. **Blacklisting**: If a match is found, the BLACKLISTER calls `blacklist_add`
3. **Notification**: The compliance service generates an alert and sends webhooks
4. **Review**: Compliance team reviews the alert and confirms the match
5. **Seizure**: If confirmed, the SEIZER calls `seize` to move funds to treasury
6. **Reporting**: All events are captured in the indexer's database for regulatory reporting

## Audit Trail

Every on-chain action emits program logs captured by the event indexer. The PostgreSQL database stores:

- All mint/burn/transfer events with timestamps and signatures
- Blacklist additions and removals
- Seizure events with source, treasury, and amount
- Pause/unpause events with the authority that triggered them

Query the database directly for regulatory reports, or use the API endpoints.

## Role Separation

For production compliance deployments, roles should be distributed:

| Role | Recommended Holder |
|------|-------------------|
| ADMIN | Multisig (e.g., Squads) |
| MINTER | Operations team wallet |
| BURNER | Operations team wallet |
| FREEZER | Compliance team wallet |
| BLACKLISTER | Compliance team wallet |
| SEIZER | Legal/compliance lead (ideally separate from BLACKLISTER) |

This ensures no single party can both blacklist and seize — dual control for the most sensitive operations.
