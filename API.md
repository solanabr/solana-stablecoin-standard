# Backend API Reference

This document summarizes backend API surfaces used by operators and dashboards.

## Services

- `services/indexer`: event indexing and decoded on-chain activity.
- `services/compliance`: blacklist and compliance-oriented APIs.
- `services/mint-burn`: automation workflows for issuance/redemption.
- `services/webhook`: outbound event notifications.

## Indexer API (Representative)

- `GET /health` — service health status.
- `GET /events?mint=<MINT>&limit=<N>` — decoded events.
- `GET /holders?mint=<MINT>` — holder balances snapshot.

## Compliance API (Representative)

- `POST /blacklist` — add wallet to blacklist.
- `DELETE /blacklist/:wallet` — remove wallet from blacklist.
- `GET /blacklist/:wallet` — current blacklist status.
- `GET /audit/export` — downloadable compliance audit records.

## Request/Response Shape Guidance

- All mutating endpoints should include:
  - operator identity
  - role used
  - reason string (where applicable)
- All responses should include:
  - request id
  - chain signature (if on-chain action)
  - normalized status code/message

## Error Model

- `400` for validation failures.
- `403` for role/authorization failures.
- `409` for state conflicts.
- `500` for unexpected infrastructure failures.
