# Backend API Reference

All services run behind `docker compose up` and are accessible locally by default.

---

## Mint-Burn Service (Port 3001)

### `GET /health`
Returns service status and current slot.

### `POST /mint`
Submits a mint request. Executes asynchronously.

**Body:**
```json
{ "recipient": "<PUBKEY>", "amount": 1000000 }
```

**Response:**
```json
{ "requestId": "<UUID>", "status": "pending" }
```

### `GET /mint/:id`
Returns mint request status.

**Response:**
```json
{
  "id": "<UUID>",
  "mint": "<PUBKEY>",
  "recipient": "<PUBKEY>",
  "amount": "1000000",
  "status": "executed",   // pending | verified | executed | failed
  "tx_sig": "<SIGNATURE>",
  "created_at": "2025-01-01T00:00:00Z"
}
```

### `POST /burn`
Submit a burn request.

**Body:**
```json
{ "from": "<PUBKEY>", "amount": 1000000 }
```

### `GET /burn/:id`
Returns burn request status.

---

## Event Listener (Port 3002)

### `GET /health`
Returns service status and last indexed slot.

Events are indexed automatically. Access them via the PostgreSQL `onchain_events` table directly, or via the compliance service's audit log endpoint.

---

## Compliance Service — SSS-2 (Port 3003)

### `GET /health`
Returns service status.

### `POST /blacklist`
Add address to blacklist.

**Body:**
```json
{ "address": "<PUBKEY>", "reason": "OFAC SDN match" }
```

**Response:**
```json
{ "success": true, "txSig": "<SIGNATURE>" }
```

### `DELETE /blacklist/:address`
Remove address from blacklist.

**Body:**
```json
{ "reason": "Cleared by compliance team" }
```

### `GET /blacklist/:address`
Check blacklist status and history.

**Response:**
```json
{
  "address": "<PUBKEY>",
  "blacklisted": true,
  "history": [
    {
      "action": "add",
      "reason": "OFAC match",
      "actor": "<PUBKEY>",
      "tx_sig": "<SIGNATURE>",
      "created_at": "..."
    }
  ]
}
```

### `POST /seize`
Seize tokens from a blacklisted address.

**Body:**
```json
{ "address": "<PUBKEY>", "treasury": "<PUBKEY>" }
```

### `GET /audit-log`
Export audit log.

**Query params:** `?action=<type>&limit=100&offset=0`

**Response:**
```json
{
  "entries": [
    {
      "action": "blacklist_add",
      "actor": "<PUBKEY>",
      "target": "<PUBKEY>",
      "reason": "OFAC match",
      "tx_sig": "<SIGNATURE>",
      "created_at": "..."
    }
  ],
  "total": 42
}
```

---

## Webhook Service (Port 3004)

### `GET /health`
Returns service status.

### `POST /endpoints`
Register a webhook endpoint.

**Body:**
```json
{
  "url": "https://your-server.com/webhook",
  "secret": "optional-hmac-secret",
  "events": ["tokens_minted", "address_blacklisted"]  // [] = all events
}
```

**Response:**
```json
{ "id": "<UUID>", "url": "...", "events": [...] }
```

### `GET /endpoints`
List active webhook endpoints.

### `DELETE /endpoints/:id`
Deactivate a webhook endpoint.

### Webhook Payload Format

```json
{
  "id": "<delivery-uuid>",
  "eventType": "tokens_minted",
  "payload": {
    "mint": "<PUBKEY>",
    "txSig": "<SIGNATURE>",
    "slot": 123456789,
    "blockTime": 1700000000
  },
  "timestamp": "2025-01-01T00:00:00Z"
}
```

### Webhook Signature Verification

If a secret is set, the service includes `X-SSS-Signature: sha256=<hmac>` in each request. Verify in your handler:

```typescript
import * as crypto from "crypto";

function verifyWebhook(body: string, signature: string, secret: string): boolean {
  const expected = crypto
    .createHmac("sha256", secret)
    .update(body)
    .digest("hex");
  return `sha256=${expected}` === signature;
}
```

### Retry Policy

Failed deliveries are retried with exponential backoff:
- Attempt 1: immediate
- Attempt 2: 1s delay
- Attempt 3: 2s delay
- Attempt 4: 4s delay
- Attempt 5: 8s delay (final)

After `MAX_RETRY_ATTEMPTS` failures, the delivery is marked `failed` and no further retries are attempted.