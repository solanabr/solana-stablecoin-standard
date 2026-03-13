# Compliance Guide

## Overview

This document covers regulatory considerations for stablecoin issuers using SSS-2, audit trail formats, and integration points for compliance systems.

## Regulatory Framework

### OFAC Sanctions

The Office of Foreign Assets Control (OFAC) maintains sanctions lists that financial institutions must enforce. SSS-2's blacklist mechanism maps directly:

| OFAC Requirement | SSS-2 Implementation |
|-----------------|---------------------|
| Screen transactions | Transfer hook checks every transfer |
| Block sanctioned parties | Blacklist PDAs prevent transfers |
| Report to authorities | Audit trail export via backend API |
| Freeze assets | Token account freeze + blacklist |
| Seize if required | Permanent delegate seizure |

### GENIUS Act

The Guiding and Establishing National Innovation for U.S. Stablecoins Act establishes requirements for stablecoin issuers:

| GENIUS Act Requirement | SSS-2 Implementation |
|----------------------|---------------------|
| Consumer protection | Role-based access prevents unauthorized minting |
| Reserve transparency | On-chain supply tracking (totalMinted, totalBurned) |
| Compliance controls | Transfer hook + blacklist enforcement |
| Audit capabilities | Structured audit trail with export |

### MiCA (EU Markets in Crypto-Assets)

| MiCA Requirement | SSS-2 Implementation |
|-----------------|---------------------|
| Orderly wind-down | Pause + burn capabilities |
| Law enforcement cooperation | Freeze + seize capabilities |
| Transaction monitoring | Event listener + webhook notifications |

## Audit Trail Format

### On-Chain Events

Every significant action emits an Anchor event that can be indexed:

```json
{
  "event": "BlacklistAdded",
  "data": {
    "mint": "...",
    "account": "...",
    "reason": "OFAC SDN List match - Entity XYZ",
    "authority": "...",
    "timestamp": 1700000000
  },
  "signature": "...",
  "slot": 123456789
}
```

### Backend Audit Records

The compliance service maintains structured records:

```json
{
  "id": "uuid",
  "action": "blacklist_add",
  "target": "wallet_address",
  "reason": "OFAC SDN List match",
  "authority": "operator_address",
  "signature": "tx_signature",
  "timestamp": "2024-01-15T10:30:00Z",
  "metadata": {
    "screening_source": "chainalysis",
    "match_confidence": 0.95
  }
}
```

### Export Formats

**JSON Export:**
```bash
curl http://localhost:3000/api/v1/compliance/audit-trail/export?format=json
```

**CSV Export:**
```bash
curl http://localhost:3000/api/v1/compliance/audit-trail/export?format=csv
```

CSV columns: `id, action, target, reason, authority, signature, timestamp`

## Sanctions Screening Integration

The backend provides an integration point for sanctions screening APIs:

```bash
POST /api/v1/compliance/screen
{
  "address": "wallet_address"
}
```

Response:
```json
{
  "flagged": false,
  "source": "chainalysis",
  "details": "No match found"
}
```

### Supported Screening Providers

The `ComplianceService.screenAddress()` method is designed as an integration point. Replace the placeholder with your chosen provider:

- **Chainalysis KYT** — Real-time transaction monitoring
- **Elliptic** — Blockchain analytics and screening
- **TRM Labs** — Sanctions and risk scoring
- **Custom** — Your own screening infrastructure

## Webhook Notifications

Configure webhooks to receive real-time compliance events:

```
WEBHOOK_URL=https://your-compliance-system.com/webhook
WEBHOOK_SECRET=your-hmac-secret
```

Webhook payload:
```json
{
  "event": "BlacklistAdded",
  "data": { ... },
  "signature": "tx_signature",
  "timestamp": "2024-01-15T10:30:00Z"
}
```

Signature verification:
```
X-SSS-Signature: HMAC-SHA256(secret, JSON.stringify(payload))
```

## Best Practices

1. **Screen before minting** — Always screen recipients before minting tokens
2. **Automate blacklist updates** — Integrate sanctions list feeds with automatic blacklisting
3. **Retain audit trails** — Export and archive compliance records regularly
4. **Separate roles** — Never give one person both BLACKLISTER and SEIZER roles
5. **Document procedures** — Maintain written compliance policies alongside the technical implementation
6. **Regular audits** — Periodically verify that blacklist state matches current sanctions lists
7. **Incident response** — Have a documented procedure for handling sanctions matches
