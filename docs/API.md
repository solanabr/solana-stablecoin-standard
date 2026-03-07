# Backend API Reference

Three Docker-containerized services provide off-chain infrastructure.

## Indexer Service (port 3000)

Subscribes to sss-token program logs, decodes Anchor events, dispatches webhooks.

### GET /health
```json
{ "status": "ok", "service": "sss-indexer" }
```

### GET /events
Returns recent decoded events (in-memory buffer).

**Response:**
```json
{
  "events": [
    {
      "name": "TokensMinted",
      "data": { "mint": "...", "recipient": "...", "amount": 1000000, "minter": "..." }
    }
  ]
}
```

**Webhook delivery:** Set `WEBHOOK_URL` environment variable. The indexer POSTs events:
```json
{
  "event": "BlacklistAdded",
  "data": { "mint": "...", "address": "...", "reason": "OFAC match", "by": "..." },
  "timestamp": "2026-03-05T14:23:11Z"
}
```

---

## Mint/Burn Service (port 3001)

REST API for coordinating fiat-to-stablecoin lifecycle operations.

### GET /health
```json
{ "status": "ok", "service": "sss-mint-burn" }
```

### POST /mint
Mint tokens to a recipient.

**Request:**
```json
{
  "recipient": "7vFxxx...abc",
  "amount": "1000",
  "requestId": "uuid-optional"
}
```

**Response:**
```json
{
  "requestId": "abc-123",
  "signature": "5Rxxx...",
  "status": "executed"
}
```

**Error:**
```json
{
  "requestId": "abc-123",
  "error": "QuotaExceeded"
}
```

### POST /burn
Burn tokens from a token account (authority must own the account or be the burner role).

**Request:**
```json
{
  "tokenAccount": "9xyyy...def",
  "amount": "500",
  "requestId": "uuid-optional"
}
```

**Response:** Same format as `/mint`.

---

## Compliance Service (port 3002)

SSS-2 only. Manages blacklist and stores compliance audit trail locally.

### GET /health
```json
{ "status": "ok", "service": "sss-compliance" }
```

### POST /blacklist/add
Add an address to the on-chain blacklist.

**Request:**
```json
{
  "address": "7vFxxx...abc",
  "reason": "OFAC SDN match"
}
```

**Response:**
```json
{
  "signature": "5Rxxx...",
  "status": "blacklisted"
}
```

### POST /blacklist/remove
Remove an address from the blacklist.

**Request:**
```json
{ "address": "7vFxxx...abc" }
```

**Response:**
```json
{
  "signature": "5Rxxx...",
  "status": "removed"
}
```

### GET /blacklist
Returns all blacklisted addresses from on-chain state.

**Response:**
```json
[
  {
    "address": "7vFxxx...abc",
    "reason": "OFAC match",
    "blacklister": "AuthPubkey...",
    "timestamp": "2026-03-05T14:23:11Z"
  }
]
```

### GET /audit-log
Returns the local compliance audit trail.

**Query params:**
- `action` — filter by action type (`blacklist_add`, `blacklist_remove`, `seize`, `freeze`)
- `limit` — max results (default: 100)

**Response:**
```json
[
  {
    "id": 42,
    "action": "blacklist_add",
    "address": "7vFxxx...abc",
    "reason": "OFAC SDN match",
    "operator": "AuthPubkey...",
    "signature": "5Rxxx...",
    "timestamp": "2026-03-05T14:23:11Z"
  }
]
```

---

## Environment Variables

| Variable | Service | Default | Description |
|----------|---------|---------|-------------|
| `PORT` | All | 3000/3001/3002 | HTTP port |
| `RPC_URL` | All | `http://localhost:8899` | Solana RPC HTTP |
| `RPC_WS_URL` | Indexer | `ws://localhost:8900` | Solana RPC WebSocket |
| `SSS_PROGRAM_ID` | Indexer | Default program ID | sss-token program ID |
| `MINT` | Mint-burn, Compliance | — | Token-2022 mint pubkey |
| `AUTHORITY_KEYPAIR_PATH` | Mint-burn, Compliance | `/secrets/authority.json` | Path to keypair JSON |
| `WEBHOOK_URL` | Indexer | — | Event webhook destination |
| `DB_PATH` | Compliance | `./data/compliance.db` | SQLite DB path |
