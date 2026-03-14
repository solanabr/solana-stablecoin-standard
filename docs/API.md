# Backend API Reference

The SSS backend consists of four microservices that provide operational support for stablecoin issuers. All services run as Node.js HTTP servers and are orchestrated via Docker Compose.

---

## Table of Contents

- [Architecture Overview](#architecture-overview)
- [Docker Compose Setup](#docker-compose-setup)
- [Mint/Burn Service](#mintburn-service)
- [Compliance Service](#compliance-service)
- [Indexer Service](#indexer-service)
- [Webhook Service](#webhook-service)
- [Common Patterns](#common-patterns)

---

## Architecture Overview

```
+-------------------+     +---------------------+
|  Mint/Burn        |     |  Compliance          |
|  Service          |     |  Service             |
|  :8081            |     |  :8082               |
+-------------------+     +---------------------+
         |                          |
         v                          v
+---------------------------------------------------+
|           Solana (sss-core program)                |
+---------------------------------------------------+
         ^                          ^
         |                          |
+-------------------+     +---------------------+
|  Indexer           |     |  Webhook             |
|  Service           |     |  Service             |
|  :8083             |     |  :8084               |
+-------------------+     +---------------------+
```

| Service | Host Port | Container Port | Purpose |
|---------|-----------|---------------|---------|
| mint-burn-service | 8081 | 8080 | Mint/burn request queue |
| compliance-service | 8082 | 8080 | Blacklist mirror, seizure queue, audit |
| indexer | 8083 | 8080 | Event indexing, holder tracking, supply, WebSocket |
| webhook-service | 8084 | 8080 | Webhook registration and delivery |

All services expose a `GET /health` endpoint for liveness checks.

---

## Docker Compose Setup

### docker-compose.yml

```yaml
services:
  mint-burn-service:
    build: ./mint-burn-service
    ports:
      - "8081:8080"
  compliance-service:
    build: ./compliance-service
    ports:
      - "8082:8080"
  indexer:
    build: ./indexer
    ports:
      - "8083:8080"
  webhook-service:
    build: ./webhook-service
    ports:
      - "8084:8080"
```

### Starting Services

```bash
cd backend
docker compose up -d
```

### Stopping Services

```bash
docker compose down
```

### Running Individually (Development)

Each service can be run standalone:

```bash
cd backend/mint-burn-service
PORT=8081 npx ts-node src/index.ts
```

---

## Mint/Burn Service

Base URL: `http://localhost:8081`

Manages mint and burn request queues. Requests are stored in-memory and can be approved or processed by external systems.

### POST /mint-requests

Create a new mint request.

**Request:**

```json
{
  "recipient": "ABcD1234...pubkey",
  "amount": 1000000,
  "minter": "EfGh5678...pubkey"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| recipient | string | Yes | Recipient wallet address |
| amount | number | Yes | Amount in base units (must be > 0) |
| minter | string | Yes | Minter wallet address |

**Response (201 Created):**

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "type": "mint",
  "recipient": "ABcD1234...pubkey",
  "amount": 1000000,
  "minter": "EfGh5678...pubkey",
  "status": "pending",
  "createdAt": "2025-01-15T10:30:00.000Z"
}
```

**Errors:**

| Status | Condition |
|--------|-----------|
| 400 | Missing fields, invalid JSON, or amount <= 0 |

### POST /burn-requests

Create a new burn request.

**Request:**

```json
{
  "amount": 500000,
  "burner": "EfGh5678...pubkey"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| amount | number | Yes | Amount in base units (must be > 0) |
| burner | string | Yes | Burner wallet address |

**Response (201 Created):**

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440001",
  "type": "burn",
  "amount": 500000,
  "burner": "EfGh5678...pubkey",
  "status": "pending",
  "createdAt": "2025-01-15T10:31:00.000Z"
}
```

### GET /requests

List all mint and burn requests with optional filters.

**Query Parameters:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| status | string | (all) | Filter by status: `pending`, `approved`, `rejected` |
| type | string | (all) | Filter by type: `mint`, `burn` |
| limit | number | 100 | Max results (capped at 1000) |
| offset | number | 0 | Pagination offset |

**Response (200 OK):**

```json
{
  "total": 42,
  "limit": 100,
  "offset": 0,
  "data": [
    {
      "id": "...",
      "type": "mint",
      "recipient": "...",
      "amount": 1000000,
      "minter": "...",
      "status": "pending",
      "createdAt": "..."
    }
  ]
}
```

### GET /health

```json
{
  "service": "mint-burn-service",
  "ok": true,
  "uptime": 3600.5
}
```

---

## Compliance Service

Base URL: `http://localhost:8082`

Manages the off-chain blacklist mirror, seizure request queue, and compliance audit events.

### POST /blacklist

Add an address to the off-chain blacklist mirror.

**Request:**

```json
{
  "address": "ABcD1234...pubkey",
  "reason": "OFAC SDN list match"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| address | string | Yes | Wallet address to blacklist |
| reason | string | Yes | Reason for blacklisting |

**Response (201 Created):**

```json
{
  "address": "ABcD1234...pubkey",
  "reason": "OFAC SDN list match",
  "createdAt": "2025-01-15T10:30:00.000Z"
}
```

**Errors:**

| Status | Condition |
|--------|-----------|
| 400 | Missing fields or invalid JSON |
| 409 | Address already blacklisted |

### DELETE /blacklist/:address

Remove an address from the off-chain blacklist mirror.

**Response (200 OK):**

```json
{
  "message": "Address removed from blacklist",
  "address": "ABcD1234...pubkey"
}
```

**Errors:**

| Status | Condition |
|--------|-----------|
| 404 | Address not found in blacklist |

### GET /blacklist

List all blacklisted addresses.

**Response (200 OK):**

```json
{
  "total": 5,
  "data": [
    {
      "address": "ABcD1234...pubkey",
      "reason": "OFAC SDN list match",
      "createdAt": "2025-01-15T10:30:00.000Z"
    }
  ]
}
```

### POST /seize

Create a seizure request.

**Request:**

```json
{
  "from": "ABcD1234...pubkey",
  "to": "TrEa5678...pubkey",
  "amount": 1000000
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| from | string | Yes | Source wallet (blacklisted) |
| to | string | Yes | Treasury wallet |
| amount | number | Yes | Amount in base units (must be > 0) |

**Response (201 Created):**

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440002",
  "from": "ABcD1234...pubkey",
  "to": "TrEa5678...pubkey",
  "amount": 1000000,
  "status": "pending",
  "createdAt": "2025-01-15T10:32:00.000Z"
}
```

### GET /audit/events

Query compliance audit events.

**Query Parameters:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| action | string | (all) | Filter by action: `blacklist_add`, `blacklist_remove`, `seize_request` |
| limit | number | 100 | Max results (capped at 1000) |
| offset | number | 0 | Pagination offset |

**Response (200 OK):**

```json
{
  "total": 10,
  "limit": 100,
  "offset": 0,
  "data": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440003",
      "action": "blacklist_add",
      "details": {
        "address": "ABcD1234...pubkey",
        "reason": "OFAC SDN list match"
      },
      "timestamp": "2025-01-15T10:30:00.000Z"
    }
  ]
}
```

### GET /health

```json
{
  "service": "compliance-service",
  "ok": true,
  "uptime": 3600.5,
  "blacklistSize": 5
}
```

---

## Indexer Service

Base URL: `http://localhost:8083`

Indexes on-chain events, tracks token holders, monitors supply, and provides a WebSocket feed for real-time updates.

### GET /events

Query indexed on-chain events.

**Query Parameters:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| type | string | (all) | Filter by event type: `mint`, `burn`, `transfer`, `freeze`, `blacklist`, etc. |
| limit | number | 100 | Max results (capped at 1000) |
| offset | number | 0 | Pagination offset |

**Response (200 OK):**

```json
{
  "total": 150,
  "limit": 100,
  "offset": 0,
  "data": [
    {
      "id": "550e8400-...",
      "type": "mint",
      "data": {
        "amount": 1000000,
        "recipient": "Abc123...def"
      },
      "blockTime": 1705312200,
      "slot": 200000000,
      "signature": "5KtPn1...abc",
      "timestamp": "2025-01-15T10:30:00.000Z"
    }
  ]
}
```

### GET /holders

Get token holders for a specific mint.

**Query Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| mint | string | Yes | Mint address |
| minBalance | number | No | Minimum balance filter (default: 0) |

**Response (200 OK):**

```json
{
  "total": 2,
  "data": [
    {
      "address": "Abc123...def",
      "mint": "So111...112",
      "balance": 500000,
      "lastUpdated": "2025-01-15T10:30:00.000Z"
    },
    {
      "address": "Xyz789...ghi",
      "mint": "So111...112",
      "balance": 500000,
      "lastUpdated": "2025-01-15T10:30:00.000Z"
    }
  ]
}
```

Results are sorted by balance descending.

### GET /supply

Get supply information for all tracked mints.

**Response (200 OK):**

```json
{
  "data": [
    {
      "mint": "So111...112",
      "totalSupply": 1000000,
      "circulatingSupply": 1000000,
      "lastUpdated": "2025-01-15T10:30:00.000Z"
    }
  ]
}
```

### WebSocket (ws://localhost:8083)

Connect to any path (typically `/ws` or `/`) via WebSocket upgrade for real-time event streaming.

**Connection:**

```javascript
const ws = new WebSocket("ws://localhost:8083/ws");

ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  console.log(data);
};
```

**Welcome Message:**

```json
{
  "type": "connected",
  "message": "Subscribed to live events"
}
```

**Event Message:**

```json
{
  "type": "event",
  "data": {
    "id": "...",
    "type": "mint",
    "data": { "amount": 1000000 },
    "blockTime": 1705312200,
    "slot": 200000100,
    "signature": "...",
    "timestamp": "..."
  }
}
```

**Heartbeat:** The server sends periodic heartbeat events (every 30 seconds) to connected clients.

**Ping/Pong:** Send `{"type": "ping"}` to receive `{"type": "pong"}`.

### GET /health

```json
{
  "service": "indexer",
  "ok": true,
  "uptime": 3600.5,
  "eventsIndexed": 150,
  "holdersTracked": 42,
  "wsClients": 3
}
```

---

## Webhook Service

Base URL: `http://localhost:8084`

Manages webhook registrations and delivers event payloads to external URLs.

### POST /webhooks

Register a new webhook.

**Request:**

```json
{
  "url": "https://example.com/webhook",
  "events": ["mint", "burn", "blacklist", "seize"]
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| url | string | Yes | HTTPS endpoint to receive webhook payloads |
| events | string[] | Yes | Event types to subscribe to (use `["*"]` for all) |

**Response (201 Created):**

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440004",
  "url": "https://example.com/webhook",
  "events": ["mint", "burn", "blacklist", "seize"],
  "active": true,
  "createdAt": "2025-01-15T10:30:00.000Z",
  "lastTriggered": null,
  "failureCount": 0
}
```

**Errors:**

| Status | Condition |
|--------|-----------|
| 400 | Missing fields, invalid URL, or empty events array |

### GET /webhooks

List all registered webhooks.

**Response (200 OK):**

```json
{
  "total": 3,
  "data": [
    {
      "id": "...",
      "url": "https://example.com/webhook",
      "events": ["mint", "burn"],
      "active": true,
      "createdAt": "...",
      "lastTriggered": "...",
      "failureCount": 0
    }
  ]
}
```

### DELETE /webhooks/:id

Remove a webhook registration.

**Response (200 OK):**

```json
{
  "message": "Webhook removed",
  "id": "550e8400-e29b-41d4-a716-446655440004"
}
```

**Errors:**

| Status | Condition |
|--------|-----------|
| 404 | Webhook ID not found |

### POST /dispatch

Internal endpoint for testing webhook delivery. Dispatches an event to all matching webhooks.

**Request:**

```json
{
  "event": "mint",
  "payload": {
    "amount": 1000000,
    "recipient": "ABcD1234...pubkey"
  }
}
```

**Response (200 OK):**

```json
{
  "message": "Event dispatched",
  "event": "mint"
}
```

### GET /deliveries

View webhook delivery logs.

**Query Parameters:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| webhookId | string | (all) | Filter by webhook ID |
| limit | number | 100 | Max results (capped at 1000) |
| offset | number | 0 | Pagination offset |

**Response (200 OK):**

```json
{
  "total": 25,
  "limit": 100,
  "offset": 0,
  "data": [
    {
      "id": "...",
      "webhookId": "550e8400-...",
      "event": "mint",
      "payload": { "amount": 1000000 },
      "statusCode": 200,
      "success": true,
      "timestamp": "2025-01-15T10:30:00.000Z"
    }
  ]
}
```

### Webhook Delivery Format

When an event is dispatched, the service POSTs to each matching webhook URL:

```json
{
  "event": "mint",
  "data": {
    "amount": 1000000,
    "recipient": "ABcD1234...pubkey"
  },
  "webhookId": "550e8400-...",
  "timestamp": "2025-01-15T10:30:00.000Z"
}
```

**Delivery properties:**
- Timeout: 10 seconds
- User-Agent: `stbr-webhook-service/0.1.0`
- Content-Type: `application/json`
- Fire-and-forget: delivery is asynchronous
- Failures increment the webhook's `failureCount`

### GET /health

```json
{
  "service": "webhook-service",
  "ok": true,
  "uptime": 3600.5,
  "registeredWebhooks": 3,
  "totalDeliveries": 25
}
```

---

## Common Patterns

### Pagination

All list endpoints support pagination with `limit` and `offset` query parameters:

```bash
# First page
curl "http://localhost:8083/events?limit=20&offset=0"

# Second page
curl "http://localhost:8083/events?limit=20&offset=20"
```

Response always includes `total`, `limit`, and `offset` fields.

### Error Responses

All errors follow a consistent format:

```json
{
  "error": "Description of what went wrong"
}
```

### Health Checks

All services expose `GET /health` returning:

```json
{
  "service": "<service-name>",
  "ok": true,
  "uptime": <seconds>
}
```

Additional fields vary by service (e.g., `blacklistSize`, `eventsIndexed`, `wsClients`).

### Content Type

All endpoints accept and return `application/json`.
