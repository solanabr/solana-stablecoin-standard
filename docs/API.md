# Backend Services API Reference

The SSS backend runs three independent services. All services expose a `/health`
endpoint and a versioned `/api/v1` prefix. In development mode, authentication
is disabled. Set the `API_SECRET` environment variable to enable Bearer token
auth on all protected routes.

---

## Authentication

Protected routes require:

```
Authorization: Bearer <token>
```

Where `<token>` matches the value of the `API_SECRET` environment variable.
In development mode (`API_SECRET` is unset), the header is ignored and all
routes are accessible without credentials.

---

## Error Format

All services return errors in a consistent envelope:

```json
{
  "error": "Human-readable error message",
  "code": "MACHINE_READABLE_CODE",
  "statusCode": 400
}
```

Common codes: `UNAUTHORIZED`, `NOT_FOUND`, `INVALID_PARAMS`, `INTERNAL_ERROR`.

---

## Mint Service — Port 3001

Handles mint and burn requests, tracks supply, and exposes request status.

### `POST /api/v1/mint/request`

Submit a mint request. If `minterKeypair` is omitted, the service uses the
configured authority keypair.

**Request**

```json
{
  "mint": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
  "recipient": "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU",
  "amount": "1000000000",
  "minterKeypair": [1, 2, 3]
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `mint` | string | yes | Base58 mint address |
| `recipient` | string | yes | Base58 recipient wallet address |
| `amount` | string | yes | Raw token units as a decimal string |
| `minterKeypair` | number[] | no | Raw keypair bytes; defaults to service authority |

**Response — 202 Accepted**

```json
{
  "id": "req_01HXYZ1234ABCD",
  "status": "pending"
}
```

**Response — 200 OK (if synchronous confirmation)**

```json
{
  "id": "req_01HXYZ1234ABCD",
  "status": "confirmed",
  "signature": "5UfgJ7...kLmNpQ"
}
```

---

### `POST /api/v1/burn/request`

Submit a burn request. The caller must own the token account. If
`burnerKeypair` is omitted the service authority is used.

**Request**

```json
{
  "mint": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
  "amount": "500000000",
  "burnerKeypair": [1, 2, 3]
}
```

**Response — 202 Accepted**

```json
{
  "id": "req_01HXYZ5678EFGH",
  "status": "pending"
}
```

**Response — 200 OK**

```json
{
  "id": "req_01HXYZ5678EFGH",
  "status": "confirmed",
  "signature": "3TrKq9...wXyZaB"
}
```

---

### `GET /api/v1/mint/:id`

Retrieve the status of a mint or burn request by ID.

**Response — 200 OK**

```json
{
  "id": "req_01HXYZ1234ABCD",
  "status": "confirmed",
  "signature": "5UfgJ7...kLmNpQ",
  "createdAt": "2026-02-22T10:00:00.000Z",
  "confirmedAt": "2026-02-22T10:00:04.321Z"
}
```

`confirmedAt` is omitted while `status` is `"pending"`.

---

### `GET /api/v1/supply`

Return aggregate supply metrics for a mint.

**Query parameters:** `?mint=<base58>`

**Response — 200 OK**

```json
{
  "mint": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
  "totalMinted": "10000000000",
  "totalBurned": "500000000",
  "circulating": "9500000000"
}
```

All amounts are raw token units as decimal strings.

---

### `GET /health` (Mint Service)

**Response — 200 OK**

```json
{
  "status": "ok",
  "service": "mint-service",
  "uptime": 3821
}
```

`uptime` is seconds since process start.

---

## Indexer Service — Port 3002

Consumes on-chain program logs, stores parsed events, and delivers webhooks.

### `POST /api/v1/webhooks`

Register a webhook to receive real-time event notifications.

**Request**

```json
{
  "url": "https://your-system.example.com/hooks/sss",
  "events": ["BlacklistAdded", "BlacklistRemoved", "TokensSeized", "TokensMinted"]
}
```

`events` is a list of Anchor event names. Use `"*"` to subscribe to all events.

**Response — 201 Created**

```json
{
  "id": "wh_01HXYZ9999IJKL",
  "url": "https://your-system.example.com/hooks/sss",
  "events": ["BlacklistAdded", "BlacklistRemoved", "TokensSeized", "TokensMinted"],
  "createdAt": "2026-02-22T10:05:00.000Z"
}
```

---

### `DELETE /api/v1/webhooks/:id`

Unregister a webhook.

**Response — 204 No Content**

---

### `GET /api/v1/events`

Query the indexed event log with pagination.

**Query parameters**

| Parameter | Type | Description |
|-----------|------|-------------|
| `mint` | string | Filter by mint address |
| `action` | string | Filter by event name (e.g. `BlacklistAdded`) |
| `limit` | number | Max results per page (default 50, max 500) |
| `offset` | number | Pagination offset (default 0) |

**Response — 200 OK**

```json
{
  "events": [
    {
      "id": "evt_01HXYZAAAA",
      "mint": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
      "action": "BlacklistAdded",
      "actor": "9xQr2k...mNoPqR",
      "address": "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU",
      "signature": "5UfgJ7...kLmNpQ",
      "timestamp": "2026-02-22T10:00:01.000Z"
    },
    {
      "id": "evt_01HXYZBBBB",
      "mint": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
      "action": "TokensSeized",
      "actor": "9xQr2k...mNoPqR",
      "amount": "1000000000",
      "signature": "3TrKq9...wXyZaB",
      "timestamp": "2026-02-22T10:01:30.000Z"
    }
  ],
  "total": 47
}
```

`amount` is present for mint/burn/seizure events. `address` is present for
blacklist events. Both are omitted when not applicable.

---

### `GET /health` (Indexer Service)

**Response — 200 OK**

```json
{
  "status": "ok",
  "service": "indexer",
  "connected": true,
  "uptime": 7203
}
```

`connected` indicates whether the indexer has an active WebSocket subscription
to the Solana RPC node.

---

## Compliance Service — Port 3003

Wraps on-chain compliance instructions and provides screening and audit APIs.

### `POST /api/v1/screen`

Check whether a wallet address is currently blacklisted for a given mint.
Queries the `BlacklistEntry` PDA directly on-chain.

**Request**

```json
{
  "address": "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU",
  "mint": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"
}
```

**Response — 200 OK (not blacklisted)**

```json
{
  "address": "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU",
  "blacklisted": false
}
```

**Response — 200 OK (blacklisted)**

```json
{
  "address": "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU",
  "blacklisted": true,
  "reason": "OFAC-2026-00142",
  "blacklistedAt": "2026-02-22T09:45:00.000Z"
}
```

---

### `GET /api/v1/blacklist`

Return all active blacklist entries for a mint.

**Query parameters:** `?mint=<base58>`

**Response — 200 OK**

```json
{
  "entries": [
    {
      "address": "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU",
      "reason": "OFAC-2026-00142",
      "blacklistedAt": "2026-02-22T09:45:00.000Z",
      "blacklistedBy": "9xQr2k...mNoPqR"
    }
  ]
}
```

---

### `POST /api/v1/monitor/start`

Start continuous monitoring of an address. The service will screen the
address on each new block and POST to `webhookUrl` if the blacklist status
changes.

**Request**

```json
{
  "address": "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU",
  "mint": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
  "webhookUrl": "https://your-system.example.com/hooks/monitor"
}
```

**Response — 201 Created**

```json
{
  "monitorId": "mon_01HXYZ7777MNOP"
}
```

---

### `GET /api/v1/audit/export`

Export the compliance audit log for a mint. Returns a file download for CSV
or a JSON array for JSON format.

**Query parameters**

| Parameter | Type | Description |
|-----------|------|-------------|
| `mint` | string | Required. Base58 mint address |
| `format` | string | `csv` or `json` (default `json`) |
| `from` | string | ISO 8601 start datetime |
| `to` | string | ISO 8601 end datetime |

**Response — 200 OK (`format=json`)**

```json
[
  {
    "action": "BlacklistAdded",
    "mint": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
    "address": "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU",
    "reason": "OFAC-2026-00142",
    "actor": "9xQr2k...mNoPqR",
    "signature": "5UfgJ7...kLmNpQ",
    "timestamp": "2026-02-22T09:45:00.000Z"
  },
  {
    "action": "TokensSeized",
    "mint": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
    "amount": "1000000000",
    "actor": "9xQr2k...mNoPqR",
    "signature": "3TrKq9...wXyZaB",
    "timestamp": "2026-02-22T10:01:30.000Z"
  }
]
```

For `format=csv` the response has `Content-Type: text/csv` and
`Content-Disposition: attachment; filename="audit-<mint>-<from>-<to>.csv"`.

---

### `GET /health` (Compliance Service)

**Response — 200 OK**

```json
{
  "status": "ok",
  "service": "compliance",
  "uptime": 5412
}
```

---

## Environment Variables

| Variable | Service(s) | Description |
|----------|------------|-------------|
| `SERVICE_PORT` | all | Port the service listens on (defaults: 3001, 3002, 3003) |
| `SOLANA_RPC_URL` | all | HTTP/WebSocket RPC endpoint (e.g. `https://api.mainnet-beta.solana.com`) |
| `SSS_TOKEN_PROGRAM_ID` | all | Deployed SSS token program ID |
| `HOOK_PROGRAM_ID` | compliance | Deployed transfer hook program ID |
| `AUTHORITY_KEYPAIR_PATH` | mint, compliance | Absolute path to the authority keypair JSON file |
| `API_SECRET` | all | Bearer token secret; leave unset to disable auth in development |
| `REDIS_URL` | indexer, compliance | Redis connection URL for event queues and monitor state |
| `DATABASE_URL` | indexer | Postgres connection URL for persisted event storage |
