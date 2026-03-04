# Backend REST API Reference

Base URL: `http://localhost:4000`

## Health Check

### GET /health

Returns service health and queue metrics.

**Response:**
```json
{
  "status": "ok",
  "timestamp": 1709500000000,
  "webhookQueueSize": 0,
  "pendingAlerts": {
    "total": 2,
    "critical": 0,
    "warning": 1,
    "info": 1
  }
}
```

## Mint/Burn Lifecycle

### POST /api/v1/mint/request

Request a new mint operation.

**Body:**
```json
{
  "mint": "<mint pubkey>",
  "destination": "<destination wallet pubkey>",
  "amount": "1000000000",
  "requestedBy": "operator@example.com"
}
```

**Response:**
```json
{
  "id": "mint-1709500000000-abc123",
  "mint": "<pubkey>",
  "destination": "<pubkey>",
  "amount": "1000000000",
  "requestedBy": "operator@example.com",
  "status": "pending",
  "createdAt": 1709500000000
}
```

### POST /api/v1/mint/approve/:id

Approve and execute a pending mint request.

**Body:**
```json
{
  "approvedBy": "approver@example.com"
}
```

**Response:**
```json
{
  "id": "mint-1709500000000-abc123",
  "status": "executed",
  "txSignature": "<solana tx signature>",
  "executedAt": 1709500060000
}
```

### POST /api/v1/mint/reject/:id

Reject a pending mint request.

**Body:**
```json
{
  "rejectedBy": "approver@example.com"
}
```

### POST /api/v1/burn/request

Request a burn operation.

**Body:**
```json
{
  "mint": "<mint pubkey>",
  "amount": "500000000",
  "requestedBy": "operator@example.com"
}
```

### POST /api/v1/burn/approve/:id

Approve and execute a pending burn request.

### GET /api/v1/requests/pending

List all pending mint and burn requests.

**Response:**
```json
{
  "mints": [
    { "id": "mint-...", "amount": "1000000000", "status": "pending", ... }
  ],
  "burns": [
    { "id": "burn-...", "amount": "500000000", "status": "pending", ... }
  ]
}
```

### GET /api/v1/requests/:id

Get a specific request by ID.

## Webhooks

### POST /api/v1/webhooks

Register a new webhook subscription.

**Body:**
```json
{
  "id": "my-webhook",
  "url": "https://my-service.com/webhooks/sss",
  "events": ["mint", "burn", "seize", "blacklist"],
  "secret": "my-hmac-secret"
}
```

Event types: `mint`, `burn`, `freeze`, `thaw`, `pause`, `unpause`, `blacklist`, `seize`, `transfer`, `*` (wildcard).

### DELETE /api/v1/webhooks/:id

Remove a webhook subscription.

### Webhook Payload

Webhooks are delivered as POST requests with these headers:

| Header | Description |
|--------|-------------|
| `Content-Type` | `application/json` |
| `X-SSS-Signature` | HMAC-SHA256 hex digest of the body |
| `X-SSS-Event` | Event type (e.g., "mint") |
| `X-SSS-Delivery` | Unique delivery ID |

**Body:**
```json
{
  "id": "<delivery-id>",
  "type": "mint",
  "timestamp": 1709500000000,
  "data": {
    "amount": "1000000000",
    "destination": "<pubkey>",
    "supplyCap": "0"
  },
  "signature": "<solana tx signature>"
}
```

### Verifying Signatures

```javascript
const crypto = require("crypto");

function verifyWebhook(body, secret, signature) {
  const expected = crypto
    .createHmac("sha256", secret)
    .update(JSON.stringify(body))
    .digest("hex");
  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expected)
  );
}
```

## Compliance

### GET /api/v1/compliance/alerts

List compliance alerts.

**Query params:**
- `type` (optional): Filter by alert type

**Response:**
```json
{
  "alerts": [
    {
      "id": "seize-<signature>-1709500000000",
      "type": "seizure",
      "severity": "critical",
      "mint": "<pubkey>",
      "details": {
        "amount": "5000000000",
        "sourceAccount": "<pubkey>",
        "owner": "<pubkey>",
        "treasury": "<pubkey>",
        "txSignature": "<signature>"
      },
      "timestamp": 1709500000000,
      "acknowledged": false
    }
  ],
  "summary": {
    "total": 1,
    "critical": 1,
    "warning": 0,
    "info": 0
  }
}
```

### POST /api/v1/compliance/alerts/:id/acknowledge

Mark an alert as acknowledged.

## Error Responses

All error responses follow this format:

```json
{
  "error": "Human-readable error message"
}
```

HTTP status codes:
- `400` — Bad request (invalid parameters, business logic errors)
- `404` — Resource not found
- `500` — Internal server error
