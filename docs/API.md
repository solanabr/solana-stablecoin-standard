# Backend API Reference

The backend indexer and compliance services are built to act as the bridge between off-chain platforms (e.g. Fintech ledgers) and on-chain state.

## Webhooks

**Endpoint**: `POST /webhooks/stablecoin-event`

**Payload Format:**
```json
{
  "event_type": "MintEvent",
  "data": {
    "config": "SssConfig...",
    "minter": "MinterPubkey...",
    "to": "RecipientPubkey...",
    "amount": "100000000"
  },
  "signature": "3m4n..."
}
```

## Compliance API

Restful interface over the Docker-composed Database for querying history.

### GET /api/v1/compliance/blacklist/:address
Returns audit history for why an address was placed on the blacklist by the SSS operations module.
