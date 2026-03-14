# Backend API

All services use environment-based configuration, structured logs, and Docker deployment.

## Mint/Burn Service (`backend/mint-burn`)

- `GET /health`
- `POST /mint`
  - body: `{ "recipient": "<token-account>", "amount": "<u64>", "requestId": "..." }`
  - header: `x-request-signature` (verification stub)
- `POST /burn`
  - body: `{ "from": "<token-account>", "amount": "<u64>", "requestId": "..." }`
  - header: `x-request-signature`

Purpose:

- intake fiat-settlement-approved issuance/redemption requests
- call SDK/admin signer flow
- persist execution logs

## Indexer Service (`backend/indexer`)

- `GET /health`
- `GET /events?limit=100`

Purpose:

- ingest on-chain events
- normalize action payloads
- support webhook fanout and audit search

## Compliance Service (`backend/compliance`)

- `GET /health`
- `POST /blacklist/add`
  - body: `{ "wallet": "<pubkey>", "reason": "<text>" }`
- `POST /blacklist/remove`
  - body: `{ "wallet": "<pubkey>" }`
- `GET /blacklist/:wallet`
- `GET /audit/export?action=<action>&format=json|csv`

Purpose:

- operator-facing compliance orchestration
- blacklist state management
- audit export

## Response conventions

- `200` for successful reads and accepted operations
- `400` for malformed input
- `404` when requested record is unknown
- `409` for conflicting compliance state
- `500` for execution or downstream service failure
