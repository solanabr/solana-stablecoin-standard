# API Reference

REST API reference for the SSS backend reference implementation. This backend demonstrates how to integrate the on-chain programs into a server-side application, providing token operations, compliance management, audit trail access, and webhook-based event delivery. It is intended as a starting point for production deployments — operators should add authentication, rate limiting, and monitoring appropriate for their environment.

Source code: `backend/src/`

---

## Base URL and Authentication

| Setting | Value |
|---|---|
| Default base URL | `http://localhost:3000` |
| Content-Type | `application/json` |
| Authentication | None (see note below) |

> **Production recommendation:** The backend does not currently enforce authentication. For production deployments, add an API key or bearer token middleware before the route handlers. All compliance-sensitive endpoints (minting, blacklisting, seizure) should require authentication and be restricted to authorized operators.

---

## Error Response Format

All error responses follow this shape:

```json
{
  "error": "Human-readable error message",
  "message": "Detailed error info (development mode only)"
}
```

**HTTP status codes:**

| Status | Meaning |
|---|---|
| `200` | Success |
| `201` | Resource created (webhooks) |
| `400` | Invalid or missing request parameters |
| `404` | Resource not found (config, minter state, webhook) |
| `500` | Internal server error |
| `503` | Service unhealthy (health check failure) |

---

## Health Check

### GET /health

Returns the health status of the API server, including database connectivity and program IDs.

**Request:**

```
GET /health
```

**Response (200 — healthy):**

```json
{
  "status": "ok",
  "timestamp": "2025-01-15T10:30:00.000Z",
  "version": "0.1.0",
  "programs": {
    "sssCore": "CZzvCtyZC8KR37DNDeGYpwN46YEc7WEh6RyeSRdhjY4Y",
    "sssHook": "9aw7Ac4aGMMfND3BvYgGEcASuvyJiBXnQizbhNBphcNM"
  }
}
```

**Response (503 — unhealthy):**

```json
{
  "status": "unhealthy",
  "error": "SQLITE_CANTOPEN: unable to open database file"
}
```

---

## Token Operations

### POST /api/mint

Initiate a mint operation. Returns the derived PDA accounts needed to build and submit the on-chain transaction.

**Request:**

```
POST /api/mint
Content-Type: application/json
```

```json
{
  "mintAddress": "So11111111111111111111111111111111111111112",
  "destination": "7nYBm5mk13k2NeJFbMLVz6bqEXTzPnMJMnHgsHH1FMCH",
  "amount": 1000000
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `mintAddress` | string | Yes | Token-2022 mint public key |
| `destination` | string | Yes | Recipient token account or wallet address |
| `amount` | number | Yes | Amount to mint in base units (must be > 0) |

**Response (200):**

```json
{
  "status": "accepted",
  "mint": "So11111111111111111111111111111111111111112",
  "destination": "7nYBm5mk13k2NeJFbMLVz6bqEXTzPnMJMnHgsHH1FMCH",
  "amount": "1000000",
  "accounts": {
    "config": "3Fq4DomdgoXBYvEB7ob4d5N4bfmAVPHNagaRH4qU3gDM",
    "minterState": "5KjU8X5NRjxgACvLYsHT2qR7Qf4pXzRinKdWwesFNDAf",
    "mintAuthority": "9BcvXSH3buHVPz5gPCbKbGhXNh83d3AQZLP4pByxS6rE",
    "minter": "AuTH1r1ty111111111111111111111111111111111"
  },
  "message": "Mint operation accepted. Use the returned accounts to build and submit the on-chain transaction."
}
```

**Error (400):**

```json
{
  "error": "Invalid or missing mintAddress"
}
```

### POST /api/burn

Initiate a burn operation. Returns the derived PDA accounts needed to build and submit the on-chain transaction.

**Request:**

```
POST /api/burn
Content-Type: application/json
```

```json
{
  "mintAddress": "So11111111111111111111111111111111111111112",
  "tokenAccount": "7nYBm5mk13k2NeJFbMLVz6bqEXTzPnMJMnHgsHH1FMCH",
  "amount": 500000
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `mintAddress` | string | Yes | Token-2022 mint public key |
| `tokenAccount` | string | Yes | Token account to burn from |
| `amount` | number | Yes | Amount to burn in base units (must be > 0) |

**Response (200):**

```json
{
  "status": "accepted",
  "mint": "So11111111111111111111111111111111111111112",
  "tokenAccount": "7nYBm5mk13k2NeJFbMLVz6bqEXTzPnMJMnHgsHH1FMCH",
  "amount": "500000",
  "accounts": {
    "config": "3Fq4DomdgoXBYvEB7ob4d5N4bfmAVPHNagaRH4qU3gDM",
    "burner": "AuTH1r1ty111111111111111111111111111111111"
  },
  "message": "Burn operation accepted. Use the returned accounts to build and submit the on-chain transaction."
}
```

### GET /api/supply

Get the current token supply for a mint, including on-chain config status.

**Request:**

```
GET /api/supply?mint=So11111111111111111111111111111111111111112
```

| Query Param | Type | Required | Description |
|---|---|---|---|
| `mint` | string | Yes | Token-2022 mint public key |

**Response (200):**

```json
{
  "mint": "So11111111111111111111111111111111111111112",
  "supply": {
    "amount": "1000000000000",
    "decimals": 6,
    "uiAmount": 1000000
  },
  "config": {
    "configAddress": "3Fq4DomdgoXBYvEB7ob4d5N4bfmAVPHNagaRH4qU3gDM",
    "exists": true
  }
}
```

If no `StablecoinConfig` PDA exists for the mint, the `config` field will be `null`.

---

## Compliance Endpoints (SSS-2)

### POST /api/blacklist/add

Add a wallet to the on-chain blacklist. Returns the derived `BlacklistEntry` PDA needed to submit the on-chain transaction.

**Request:**

```
POST /api/blacklist/add
Content-Type: application/json
```

```json
{
  "mint": "So11111111111111111111111111111111111111112",
  "wallet": "SusPect111111111111111111111111111111111111",
  "reason": "OFAC SDN match — case ID 20240101-001"
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `mint` | string | Yes | Token-2022 mint public key |
| `wallet` | string | Yes | Wallet address to blacklist |
| `reason` | string | Yes | Human-readable reason (1-64 characters) |

**Response (200):**

```json
{
  "status": "accepted",
  "wallet": "SusPect111111111111111111111111111111111111",
  "mint": "So11111111111111111111111111111111111111112",
  "reason": "OFAC SDN match — case ID 20240101-001",
  "accounts": {
    "blacklistEntry": "BLaCk11st1111111111111111111111111111111111"
  },
  "message": "Blacklist add accepted. Submit the on-chain transaction using the sss-hook addToBlacklist instruction."
}
```

**Error (400):**

```json
{
  "error": "Reason must be 64 characters or fewer"
}
```

### POST /api/blacklist/remove

Remove a wallet from the on-chain blacklist.

**Request:**

```
POST /api/blacklist/remove
Content-Type: application/json
```

```json
{
  "mint": "So11111111111111111111111111111111111111112",
  "wallet": "SusPect111111111111111111111111111111111111"
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `mint` | string | Yes | Token-2022 mint public key |
| `wallet` | string | Yes | Wallet address to remove from blacklist |

**Response (200):**

```json
{
  "status": "accepted",
  "wallet": "SusPect111111111111111111111111111111111111",
  "mint": "So11111111111111111111111111111111111111112",
  "accounts": {
    "blacklistEntry": "BLaCk11st1111111111111111111111111111111111"
  },
  "message": "Blacklist remove accepted. Submit the on-chain transaction using the sss-hook removeFromBlacklist instruction."
}
```

### GET /api/blacklist/check/:wallet

Check whether a wallet is currently blacklisted for a given mint by reading the on-chain `BlacklistEntry` PDA.

**Request:**

```
GET /api/blacklist/check/SusPect111111111111111111111111111111111111?mint=So11111111111111111111111111111111111111112
```

| Path Param | Type | Required | Description |
|---|---|---|---|
| `wallet` | string | Yes | Wallet address to check |

| Query Param | Type | Required | Description |
|---|---|---|---|
| `mint` | string | Yes | Token-2022 mint public key |

**Response (200 — not blacklisted):**

```json
{
  "wallet": "SusPect111111111111111111111111111111111111",
  "mint": "So11111111111111111111111111111111111111112",
  "blacklisted": false,
  "onChainAccount": null,
  "message": "No blacklist entry found for this wallet."
}
```

**Response (200 — blacklisted):**

```json
{
  "wallet": "SusPect111111111111111111111111111111111111",
  "mint": "So11111111111111111111111111111111111111112",
  "blacklisted": true,
  "blacklistPda": "BLaCk11st1111111111111111111111111111111111",
  "message": "Wallet is currently blacklisted."
}
```

### GET /api/audit

Retrieve paginated audit trail entries from the backend database.

**Request:**

```
GET /api/audit?action=blacklist_add&limit=20&offset=0
```

| Query Param | Type | Required | Description |
|---|---|---|---|
| `action` | string | No | Filter by action type (e.g., `blacklist_add`, `mint_initiated`, `burn_initiated`, `blacklist_remove`) |
| `actor` | string | No | Filter by actor address |
| `limit` | number | No | Results per page (default: 50, max: 200) |
| `offset` | number | No | Pagination offset (default: 0) |

**Response (200):**

```json
{
  "entries": [
    {
      "id": 42,
      "action": "blacklist_add",
      "actor": "api",
      "target": "SusPect111111111111111111111111111111111111",
      "details": {
        "mint": "So11111111111111111111111111111111111111112",
        "reason": "OFAC SDN match — case ID 20240101-001",
        "blacklistPda": "BLaCk11st1111111111111111111111111111111111"
      },
      "timestamp": "2025-01-15 10:30:00"
    }
  ],
  "pagination": {
    "limit": 20,
    "offset": 0,
    "total": 1,
    "hasMore": false
  }
}
```

---

## Info Endpoints

### GET /api/config/:mint

Retrieve the `StablecoinConfig` account state for a mint by reading and parsing the on-chain PDA.

**Request:**

```
GET /api/config/So11111111111111111111111111111111111111112
```

| Path Param | Type | Required | Description |
|---|---|---|---|
| `mint` | string | Yes | Token-2022 mint public key |

**Response (200):**

```json
{
  "configPda": "3Fq4DomdgoXBYvEB7ob4d5N4bfmAVPHNagaRH4qU3gDM",
  "presetLabel": "SSS-2 (Compliant)",
  "mint": "So11111111111111111111111111111111111111112",
  "preset": 2,
  "authority": "AuTH1r1ty111111111111111111111111111111111",
  "pendingAuthority": "11111111111111111111111111111111",
  "masterMinter": "MaSTerM1nter11111111111111111111111111111",
  "pauser": "PaUsEr111111111111111111111111111111111111",
  "blacklister": "BLaCkL1ster1111111111111111111111111111111",
  "paused": false,
  "totalMinted": "5000000000000",
  "totalBurned": "1000000000000",
  "totalSeized": "0",
  "bump": 255,
  "mintAuthorityBump": 254
}
```

**Response (404):**

```json
{
  "error": "Stablecoin config not found",
  "configPda": "3Fq4DomdgoXBYvEB7ob4d5N4bfmAVPHNagaRH4qU3gDM"
}
```

### GET /api/minters/:mint

List all minter accounts for a given mint by scanning program accounts with discriminator and config PDA filters.

**Request:**

```
GET /api/minters/So11111111111111111111111111111111111111112
```

| Path Param | Type | Required | Description |
|---|---|---|---|
| `mint` | string | Yes | Token-2022 mint public key |

**Response (200):**

```json
{
  "mint": "So11111111111111111111111111111111111111112",
  "configPda": "3Fq4DomdgoXBYvEB7ob4d5N4bfmAVPHNagaRH4qU3gDM",
  "count": 2,
  "minters": [
    {
      "address": "5KjU8X5NRjxgACvLYsHT2qR7Qf4pXzRinKdWwesFNDAf",
      "config": "3Fq4DomdgoXBYvEB7ob4d5N4bfmAVPHNagaRH4qU3gDM",
      "minter": "M1nTer1111111111111111111111111111111111111",
      "quota": "1000000000000",
      "mintedAmount": "250000000000",
      "enabled": true,
      "bump": 253
    },
    {
      "address": "8BtV9X5NRjxgACvLYsHT2qR7Qf4pXzRinKdWwesFNDAf",
      "config": "3Fq4DomdgoXBYvEB7ob4d5N4bfmAVPHNagaRH4qU3gDM",
      "minter": "M1nTer2222222222222222222222222222222222222",
      "quota": "500000000000",
      "mintedAmount": "500000000000",
      "enabled": false,
      "bump": 252
    }
  ]
}
```

### GET /api/minter/:mint/:wallet

Get a specific minter's state, including remaining quota.

**Request:**

```
GET /api/minter/So11111111111111111111111111111111111111112/M1nTer1111111111111111111111111111111111111
```

| Path Param | Type | Required | Description |
|---|---|---|---|
| `mint` | string | Yes | Token-2022 mint public key |
| `wallet` | string | Yes | Minter wallet address |

**Response (200):**

```json
{
  "minterStatePda": "5KjU8X5NRjxgACvLYsHT2qR7Qf4pXzRinKdWwesFNDAf",
  "config": "3Fq4DomdgoXBYvEB7ob4d5N4bfmAVPHNagaRH4qU3gDM",
  "minter": "M1nTer1111111111111111111111111111111111111",
  "quota": "1000000000000",
  "mintedAmount": "250000000000",
  "enabled": true,
  "bump": 253,
  "remainingQuota": "750000000000"
}
```

**Response (404):**

```json
{
  "error": "Minter state not found",
  "minterStatePda": "5KjU8X5NRjxgACvLYsHT2qR7Qf4pXzRinKdWwesFNDAf"
}
```

---

## Webhook Management

### POST /api/webhooks

Register a new webhook to receive event notifications.

**Request:**

```
POST /api/webhooks
Content-Type: application/json
```

```json
{
  "url": "https://compliance.example.com/sss-events",
  "eventTypes": ["TokensMinted", "TokensBurned", "AddedToBlacklist", "TokensSeized"],
  "secret": "whsec_a1b2c3d4e5f6g7h8i9j0"
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `url` | string | Yes | HTTPS endpoint to receive webhook deliveries |
| `eventTypes` | string[] | No | List of event types to subscribe to; omit or pass `"*"` for all events |
| `secret` | string | No | Shared secret for HMAC-SHA256 payload signing |

**Response (201):**

```json
{
  "id": 1,
  "url": "https://compliance.example.com/sss-events",
  "eventTypes": "TokensMinted,TokensBurned,AddedToBlacklist,TokensSeized",
  "active": true,
  "createdAt": "2025-01-15 10:30:00"
}
```

### GET /api/webhooks

List all registered webhooks.

**Request:**

```
GET /api/webhooks
```

**Response (200):**

```json
{
  "count": 2,
  "webhooks": [
    {
      "id": 1,
      "url": "https://compliance.example.com/sss-events",
      "eventTypes": "TokensMinted,TokensBurned,AddedToBlacklist,TokensSeized",
      "active": true,
      "createdAt": "2025-01-15 10:30:00"
    },
    {
      "id": 2,
      "url": "https://monitoring.example.com/hooks",
      "eventTypes": "*",
      "active": false,
      "createdAt": "2025-01-14 08:00:00"
    }
  ]
}
```

### DELETE /api/webhooks/:id

Deactivate a webhook. The webhook record is retained (with `active = false`) for audit purposes.

**Request:**

```
DELETE /api/webhooks/1
```

| Path Param | Type | Required | Description |
|---|---|---|---|
| `id` | number | Yes | Webhook ID |

**Response (200):**

```json
{
  "status": "deactivated",
  "id": 1
}
```

**Response (404):**

```json
{
  "error": "Webhook not found"
}
```

### GET /api/webhooks/:id/deliveries

Retrieve paginated delivery history for a specific webhook.

**Request:**

```
GET /api/webhooks/1/deliveries?limit=10&offset=0
```

| Path Param | Type | Required | Description |
|---|---|---|---|
| `id` | number | Yes | Webhook ID |

| Query Param | Type | Required | Description |
|---|---|---|---|
| `limit` | number | No | Results per page (default: 50, max: 200) |
| `offset` | number | No | Pagination offset (default: 0) |

**Response (200):**

```json
{
  "webhookId": 1,
  "deliveries": [
    {
      "id": 15,
      "webhook_id": 1,
      "event_id": 42,
      "attempt": 1,
      "status_code": 200,
      "response_body": "{\"received\":true}",
      "error": null,
      "delivered_at": "2025-01-15 10:30:05"
    },
    {
      "id": 14,
      "webhook_id": 1,
      "event_id": 41,
      "attempt": 2,
      "status_code": 500,
      "response_body": "Internal Server Error",
      "error": null,
      "delivered_at": "2025-01-15 10:29:03"
    }
  ],
  "pagination": {
    "limit": 10,
    "offset": 0,
    "total": 2,
    "hasMore": false
  }
}
```

---

## Webhook Payload Format

### Event Payload Schema

When an event is dispatched to a webhook, the payload has this structure:

```json
{
  "event_id": 42,
  "event_type": "AddedToBlacklist",
  "program_id": "9aw7Ac4aGMMfND3BvYgGEcASuvyJiBXnQizbhNBphcNM",
  "signature": "5KjU8X5NRjxgACvLYsHT2qR7Qf4pXzRinKdWwesFNDAf...",
  "slot": 285032041,
  "data": {
    "mint": "So11111111111111111111111111111111111111112",
    "wallet": "SusPect111111111111111111111111111111111111",
    "reason": "OFAC SDN match",
    "blacklisted_by": "BLaCkL1ster1111111111111111111111111111111"
  },
  "timestamp": "2025-01-15 10:30:00"
}
```

### HMAC-SHA256 Signature Verification

If a `secret` was provided when registering the webhook, each delivery includes a signature header:

```
X-SSS-Signature: sha256=a1b2c3d4e5f6...
```

To verify the signature on your server:

```typescript
import crypto from "crypto";

function verifySignature(payload: string, signature: string, secret: string): boolean {
  const expected = "sha256=" + crypto
    .createHmac("sha256", secret)
    .update(payload)
    .digest("hex");
  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expected)
  );
}

// In your webhook handler:
const rawBody = JSON.stringify(req.body);
const sig = req.headers["x-sss-signature"] as string;
if (!verifySignature(rawBody, sig, "whsec_a1b2c3d4e5f6g7h8i9j0")) {
  return res.status(401).send("Invalid signature");
}
```

### Retry Policy

| Attempt | Delay Before Retry | Notes |
|---|---|---|
| 1 | Immediate | First delivery attempt |
| 2 | 1 second | Exponential backoff: `baseDelay * 2^0` |
| 3 | 2 seconds | Exponential backoff: `baseDelay * 2^1` |

- Maximum retries: 3 (configurable via `WEBHOOK_MAX_RETRIES`)
- Base delay: 1000ms (configurable via `WEBHOOK_RETRY_DELAY_MS`)
- A delivery is considered successful if the response status code is 2xx
- Non-2xx responses and network errors trigger retries
- All delivery attempts (successful and failed) are recorded in the `webhook_deliveries` table
- Request timeout: 10 seconds per attempt

### Event Types

The following event types can be used in webhook subscriptions:

**Core program events:**

| Event Type | Description |
|---|---|
| `StablecoinInitialized` | New stablecoin deployed |
| `MinterConfigured` | Minter quota set or updated |
| `MinterRemoved` | Minter disabled |
| `TokensMinted` | Tokens minted |
| `TokensBurned` | Tokens burned |
| `AccountFrozen` | Token account frozen |
| `AccountThawed` | Token account thawed |
| `Paused` | Operations paused |
| `Unpaused` | Operations resumed |
| `RoleUpdated` | Role reassigned |
| `AuthorityTransferInitiated` | Authority transfer started |
| `AuthorityTransferAccepted` | Authority transfer completed |
| `TokensSeized` | Tokens seized (SSS-2 only) |

**Hook program events:**

| Event Type | Description |
|---|---|
| `HookInitialized` | Transfer hook initialized for SSS-2 mint |
| `AddedToBlacklist` | Wallet added to blacklist |
| `RemovedFromBlacklist` | Wallet removed from blacklist |

---

## Docker Deployment

The backend ships with a multi-service `docker-compose.yml` configuration.

### Services

| Service | Command | Port | Description |
|---|---|---|---|
| `api` | `node dist/index.js` | 3000 | REST API server |
| `indexer` | `node dist/services/indexer.js` | 3001 (health) | WebSocket event indexer |
| `compliance` | `node dist/index.js --service compliance` | 3002 | Dedicated compliance API |
| `webhook` | `node dist/services/webhook.js` | 3003 (health) | Webhook delivery service |

### Quick Start

```bash
cd backend

# Create .env file with required configuration
cat > .env <<EOF
SOLANA_RPC_URL=https://api.mainnet-beta.solana.com
SOLANA_WS_URL=wss://api.mainnet-beta.solana.com
SSS_CORE_PROGRAM_ID=CZzvCtyZC8KR37DNDeGYpwN46YEc7WEh6RyeSRdhjY4Y
SSS_HOOK_PROGRAM_ID=9aw7Ac4aGMMfND3BvYgGEcASuvyJiBXnQizbhNBphcNM
LOG_LEVEL=info
EOF

# Start all services
docker compose up -d

# Verify health
curl http://localhost:3000/health
```

### Environment Variables

| Variable | Default | Description |
|---|---|---|
| `SOLANA_RPC_URL` | `http://localhost:8899` | Solana JSON-RPC endpoint |
| `SOLANA_WS_URL` | `ws://localhost:8900` | Solana WebSocket endpoint |
| `SSS_CORE_PROGRAM_ID` | `CZzvCtyZC8KR37DNDeGYpwN46YEc7WEh6RyeSRdhjY4Y` | sss-core program public key |
| `SSS_HOOK_PROGRAM_ID` | `9aw7Ac4aGMMfND3BvYgGEcASuvyJiBXnQizbhNBphcNM` | sss-hook program public key |
| `KEYPAIR_PATH` | `~/.config/solana/id.json` | Path to operator keypair |
| `PORT` | `3000` | API server port |
| `HOST` | `0.0.0.0` | API server bind address |
| `DATABASE_PATH` | `./data/sss.db` | SQLite database file path |
| `WEBHOOK_MAX_RETRIES` | `3` | Maximum webhook delivery attempts |
| `WEBHOOK_RETRY_DELAY_MS` | `1000` | Base delay between retries (ms) |
| `LOG_LEVEL` | `info` | Log verbosity (`debug`, `info`, `warn`, `error`) |

### Volume Mounts

| Volume | Container Path | Purpose |
|---|---|---|
| `sss-data` | `/app/data` | Persistent SQLite database storage |
| `${KEYPAIR_PATH}` | `/app/keypair.json` (read-only) | Operator keypair for signing transactions |

### Health Check Endpoints

Each service exposes a health check endpoint used by Docker's `HEALTHCHECK` directive:

| Service | Endpoint | Healthy Response | Check Interval |
|---|---|---|---|
| `api` | `GET http://localhost:3000/health` | `{ "status": "ok" }` | 15s |
| `indexer` | `GET http://localhost:3001/health` | `{ "status": "ok", "subscriptions": { "core": true, "hook": true } }` | 15s |
| `compliance` | `GET http://localhost:3002/health` | `{ "status": "ok" }` | 15s |
| `webhook` | `GET http://localhost:3003/health` | `{ "status": "ok", "lastProcessedEventId": 42 }` | 15s |

All health checks use: interval 15s, timeout 5s, retries 3, start period 10s.
