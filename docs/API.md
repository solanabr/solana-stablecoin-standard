# API Reference

The SSS backend provides a REST API for stablecoin operations. Built with Express, it wraps the `@stbr/sss-token` and exposes endpoints for minting, burning, freezing, compliance, and monitoring.

## Base URL

```
http://localhost:3000
```

Configurable via the `PORT` environment variable.

## Authentication

All `/operations` and `/compliance` endpoints require API key authentication.

**Header:** `x-api-key`

```bash
curl -H "x-api-key: YOUR_API_KEY" http://localhost:3000/operations/mint
```

The API key is configured via the `API_KEY` environment variable. Requests without a valid key receive a `401 Unauthorized` response.

## Rate Limiting

Protected endpoints are rate-limited to **30 requests per 60-second window** per IP address.

When the limit is exceeded, the server responds with:

```json
{
  "error": "Too many requests, please try again later"
}
```

Rate limit headers are included in responses:
- `RateLimit-Limit` -- Maximum requests per window
- `RateLimit-Remaining` -- Remaining requests in current window
- `RateLimit-Reset` -- Seconds until the window resets

## Environment Variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `PORT` | No | `3000` | Server listen port |
| `API_KEY` | Yes | -- | API key for authentication |
| `SOLANA_RPC_URL` | No | `http://localhost:8899` | Solana RPC endpoint |
| `SOLANA_WS_URL` | No | -- | WebSocket endpoint for event listening |
| `KEYPAIR_PATH` | Yes | -- | Path to operator keypair file |
| `SSS_CORE_PROGRAM_ID` | No | `Corep3p...` | Override core program ID |
| `SSS_HOOK_PROGRAM_ID` | No | `hookXMs...` | Override hook program ID |
| `WEBHOOK_URLS` | No | -- | Comma-separated webhook URLs |
| `LOG_LEVEL` | No | `info` | Logging level (debug, info, warn, error) |

## Endpoints

### Health

#### GET /health

Public endpoint. No authentication required.

**Response:**

```json
{
  "status": "ok",
  "solana": "connected",
  "slot": 12345678,
  "uptime": 3600,
  "timestamp": "2026-02-24T12:00:00.000Z"
}
```

| Field | Type | Description |
|---|---|---|
| `status` | string | Always `"ok"` |
| `solana` | string | `"connected"` or `"disconnected"` |
| `slot` | number | Current Solana slot (omitted if disconnected) |
| `uptime` | number | Server uptime in seconds |
| `timestamp` | string | ISO 8601 timestamp |

---

### Operations

All operations endpoints require authentication and are rate-limited.

#### POST /operations/mint

Mint tokens to a recipient token account.

**Request:**

```json
{
  "mint": "Base58PublicKey",
  "to": "Base58TokenAccount",
  "amount": "1000000"
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `mint` | string | Yes | Base58-encoded mint public key |
| `to` | string | Yes | Base58-encoded recipient token account |
| `amount` | string | Yes | Amount in base units (numeric string) |

**Response (200):**

```json
{
  "success": true,
  "signature": "5wH...transaction_signature"
}
```

**Errors:**

| Status | Condition |
|---|---|
| 401 | Missing or invalid API key |
| 422 | Invalid request body (bad public key, invalid amount) |
| 400 | Program error (paused, supply cap exceeded, unauthorized) |

---

#### POST /operations/burn

Burn tokens from a token account.

**Request:**

```json
{
  "mint": "Base58PublicKey",
  "from": "Base58TokenAccount",
  "amount": "500000"
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `mint` | string | Yes | Base58-encoded mint public key |
| `from` | string | Yes | Base58-encoded token account to burn from |
| `amount` | string | Yes | Amount in base units (numeric string) |

**Response (200):**

```json
{
  "success": true,
  "signature": "5wH...transaction_signature"
}
```

---

#### POST /operations/freeze

Freeze a token account.

**Request:**

```json
{
  "mint": "Base58PublicKey",
  "account": "Base58TokenAccount"
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `mint` | string | Yes | Base58-encoded mint public key |
| `account` | string | Yes | Base58-encoded token account to freeze |

**Response (200):**

```json
{
  "success": true,
  "signature": "5wH...transaction_signature"
}
```

---

#### POST /operations/thaw

Thaw a frozen token account.

**Request:**

```json
{
  "mint": "Base58PublicKey",
  "account": "Base58TokenAccount"
}
```

**Response (200):**

```json
{
  "success": true,
  "signature": "5wH...transaction_signature"
}
```

---

#### POST /operations/pause

Pause all operations for a stablecoin.

**Request:**

```json
{
  "mint": "Base58PublicKey"
}
```

**Response (200):**

```json
{
  "success": true,
  "signature": "5wH...transaction_signature"
}
```

---

#### POST /operations/unpause

Resume operations for a stablecoin.

**Request:**

```json
{
  "mint": "Base58PublicKey"
}
```

**Response (200):**

```json
{
  "success": true,
  "signature": "5wH...transaction_signature"
}
```

---

#### POST /operations/seize

Forcibly transfer tokens from one account to another (admin-only, works when paused).

**Request:**

```json
{
  "mint": "Base58PublicKey",
  "from": "Base58TokenAccount",
  "to": "Base58TokenAccount",
  "amount": "1000000"
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `mint` | string | Yes | Base58-encoded mint public key |
| `from` | string | Yes | Source token account |
| `to` | string | Yes | Destination token account |
| `amount` | string | Yes | Amount in base units (numeric string) |

**Response (200):**

```json
{
  "success": true,
  "signature": "5wH...transaction_signature"
}
```

---

### Compliance

Compliance endpoints require authentication and are rate-limited.

#### POST /compliance/blacklist/add

Add an address to the blacklist (SSS-2 only).

**Request:**

```json
{
  "mint": "Base58PublicKey",
  "address": "Base58WalletAddress",
  "reason": "OFAC sanctioned address"
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `mint` | string | Yes | Base58-encoded mint public key |
| `address` | string | Yes | Wallet address to blacklist |
| `reason` | string | Yes | Compliance reason (1-128 characters) |

**Response (200):**

```json
{
  "success": true,
  "signature": "5wH...transaction_signature"
}
```

---

#### POST /compliance/blacklist/remove

Remove an address from the blacklist.

**Request:**

```json
{
  "mint": "Base58PublicKey",
  "address": "Base58WalletAddress"
}
```

**Response (200):**

```json
{
  "success": true,
  "signature": "5wH...transaction_signature"
}
```

---

#### GET /compliance/status/:mint/:address

Check whether an address is blacklisted for a given mint.

**Parameters:**

| Parameter | Type | Description |
|---|---|---|
| `mint` | string | Base58-encoded mint public key |
| `address` | string | Base58-encoded wallet address to check |

**Response (200):**

```json
{
  "blacklisted": false
}
```

---

#### GET /compliance/audit-trail/:mint

Export the audit trail (transaction history) for a stablecoin.

**Parameters:**

| Parameter | Type | Description |
|---|---|---|
| `mint` | string | Base58-encoded mint public key |

**Query Parameters:**

| Parameter | Type | Default | Description |
|---|---|---|---|
| `action` | string | -- | Filter by action type (partial match) |
| `limit` | number | 25 | Max entries to return (1-100) |
| `before` | string | -- | Signature cursor for pagination |

**Response (200):**

```json
{
  "mint": "Base58PublicKey",
  "config": "Base58ConfigPda",
  "total": 3,
  "entries": [
    {
      "signature": "5wH...transaction_signature",
      "action": "TokensMinted",
      "timestamp": 1708800000,
      "slot": 123456789,
      "success": true,
      "memo": null
    }
  ]
}
```

---

## Error Responses

### Validation Error (422)

Returned when the request body fails Zod schema validation.

```json
{
  "error": {
    "mint": ["Invalid Solana public key"],
    "amount": ["Amount must be a numeric string"]
  }
}
```

### Program Error (400)

Returned when the on-chain operation fails.

```json
{
  "error": "Operations are paused"
}
```

Common error messages:

| Message | Cause |
|---|---|
| `Operations are paused` | Stablecoin is paused |
| `Supply cap exceeded` | Mint would exceed cap |
| `Missing required role` | Caller lacks the required role |
| `Sender is blacklisted` | Transfer hook rejected sender |
| `Receiver is blacklisted` | Transfer hook rejected receiver |

### Authentication Error (401)

```json
{
  "error": "Unauthorized: invalid or missing API key"
}
```

### Server Error (500)

```json
{
  "error": "Internal server error"
}
```

## Webhooks

The backend fires webhook notifications for on-chain events when `WEBHOOK_URLS` is configured. Each URL receives a POST with:

```json
{
  "event": "TokensMinted",
  "program": "sss-core",
  "signature": "5wH...transaction_signature",
  "data": { "raw": "base64_encoded_event_data" },
  "timestamp": 1708800000000
}
```

Webhook delivery includes exponential backoff retry (3 retries at 1s, 2s, 4s intervals) with a 5-second timeout per attempt. Failures after all retries are logged but do not affect the main application.
