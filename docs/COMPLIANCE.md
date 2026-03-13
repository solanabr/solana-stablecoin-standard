# Compliance

## Regulatory Posture

SSS-2 is designed for institutions that need explicit on-chain controls for sanctions handling, seizure authority, and audit logging. It is not legal advice and should be paired with jurisdiction-specific counsel.

The important design choice is that compliance is enforced in protocol behavior, not just recorded in metadata. A blacklist entry is meaningful because the transfer-hook path consumes it on every transfer, and seizure authority is modeled explicitly instead of being left to informal operator playbooks.

## Why The Blacklist Architecture Matters

SSS-2 uses separate blacklist PDAs, role-gated write access, and a transfer-hook enforcement path. That combination gives issuers:

- explicit and auditable blacklist state
- deterministic on-chain enforcement for blocked addresses
- a clean separation between screening, pausing, and seizure powers

This is a stronger institutional story than a basic freeze-authority token because it closes the gap between "we can react after the fact" and "the protocol rejects non-compliant transfers at execution time."

## Audit Trail Schema

```json
{
  "action": "blacklist_add",
  "mint": "<pubkey>",
  "address": "<pubkey>",
  "reason": "OFAC match",
  "actor": "<pubkey>",
  "timestamp": "2026-03-01T00:00:00Z"
}
```

## Incident Flow

Detect -> Freeze -> Investigate -> Seize or Release

## SSS-3 Extension

SSS-3 extends the compliance story without discarding it. Instead of removing enforcement, it changes the evidence model:

- transfer amounts can remain confidential
- compliance state can be represented as a compressed root
- transfer eligibility is proven through a zk proof receipt rather than a plain per-address check

That makes the privacy track legible to compliance teams: the enforcement boundary is preserved even when the transfer amount is hidden.
