# Compliance Considerations

## Regulatory model

This repository is technical infrastructure, not legal advice. Operators should define jurisdiction-specific policies for:

- blacklist criteria and evidentiary requirements,
- seizure authorization process,
- retention and disclosure requirements for audit logs.

## Audit trail format

Sensitive actions emit on-chain events and are indexed into PostgreSQL:

- `signature`
- `slot`
- `action`
- `payload` (JSON)
- `created_at`

Webhook delivery attempts are persisted with status and response metadata.

## Typical compliance actions

- add wallet to blacklist
- remove wallet from blacklist
- freeze a token account
- seize funds to treasury
- export audit records for review

Each action should have:

- operator identity
- legal or policy basis
- transaction signature
- timestamp
- affected wallet or token account
- reviewer or approval reference if applicable

## Operational controls

- Enforce multi-party governance over `master`, `blacklister`, and `seizer` keys.
- Use dedicated HSM-backed signing infrastructure in production.
- Keep `seize_requires_blacklist=true` unless an explicit override policy exists.

## Sanctions screening integration point

The backend compliance service is the intended integration surface for:

- sanctions vendor checks
- allow/deny review queues
- case notes
- CSV/JSON export for auditors
