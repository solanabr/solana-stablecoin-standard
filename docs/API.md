# Backend API Reference

The SSS backend consists of three services:

| Service | Port | Purpose |
|---|---|---|
| `mint-service` | 3001 | REST API for minting and burning stablecoins |
| `indexer` | — | Event-driven on-chain log subscriber; no HTTP API |
| `compliance-service` | 3003 | REST API for blacklist and seizure operations |

All services read `RPC_URL` and `KEYPAIR_PATH` from environment variables. The keypair at `KEYPAIR_PATH` must be the master authority (or hold the appropriate role) for operations to succeed.

Start all services:

```bash
cp backend/.env.example backend/.env
# Fill in RPC_URL, KEYPAIR_PATH, WEBHOOK_URL, WEBHOOK_SECRET
docker compose -f backend/docker-compose.yml up
```

---

## mint-service (port 3001)

### `GET /health`

Liveness check.

**Response:**

```json
{
  "status": "ok",
  "service": "mint-service"
}
```

---

### `POST /v1/mint`

Mints stablecoins to a recipient wallet. Creates the recipient's associated token account if it does not exist.

**Request body:**

```json
{
  "mint": "<MINT_PUBKEY>",
  "recipient": "<RECIPIENT_WALLET_PUBKEY>",
  "amount": "1000000",
  "reference": "order-12345"
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `mint` | `string` | Yes | Token-2022 mint address (base58) |
| `recipient` | `string` | Yes | Recipient wallet address (base58) |
| `amount` | `string` | Yes | Amount in base units (integer string) |
| `reference` | `string` | No | Idempotency key for deduplication |

**Response (200):**

```json
{
  "success": true,
  "signature": "<TRANSACTION_SIGNATURE>",
  "mint": "<MINT_PUBKEY>",
  "recipient": "<RECIPIENT_WALLET>",
  "amount": "1000000",
  "reference": "order-12345",
  "timestamp": "2026-03-03T12:00:00.000Z"
}
```

**Response (400) - Invalid request:**

```json
{
  "error": "Invalid request",
  "details": [{ "code": "invalid_type", "path": ["amount"], "message": "..." }]
}
```

**Response (500) - On-chain failure:**

```json
{
  "error": "Program is currently paused"
}
```

**Common errors:** `Program is currently paused`, `Minter quota exceeded`, `Caller is not authorized`

---

### `POST /v1/burn`

Burns stablecoins from a token account.

**Request body:**

```json
{
  "mint": "<MINT_PUBKEY>",
  "fromTokenAccount": "<TOKEN_ACCOUNT_PUBKEY>",
  "amount": "500000",
  "reference": "redemption-456"
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `mint` | `string` | Yes | Mint address |
| `fromTokenAccount` | `string` | Yes | Token account to burn from |
| `amount` | `string` | Yes | Amount in base units |
| `reference` | `string` | No | Idempotency key |

**Response (200):**

```json
{
  "success": true,
  "signature": "<TRANSACTION_SIGNATURE>",
  "mint": "<MINT_PUBKEY>",
  "fromTokenAccount": "<TOKEN_ACCOUNT>",
  "amount": "500000",
  "reference": "redemption-456",
  "timestamp": "2026-03-03T12:00:00.000Z"
}
```

---

### `GET /v1/status?mint=<pubkey>`

Returns current stablecoin configuration and total supply.

**Query parameters:**

| Parameter | Type | Required | Description |
|---|---|---|---|
| `mint` | `string` | Yes | Mint address (base58) |

**Response (200):**

```json
{
  "mint": "<MINT_PUBKEY>",
  "authority": "<AUTHORITY_PUBKEY>",
  "paused": false,
  "totalSupply": "10000000000",
  "preset": "sss-2",
  "enablePermanentDelegate": true,
  "enableTransferHook": true,
  "timestamp": "2026-03-03T12:00:00.000Z"
}
```

---

## indexer

The indexer has no HTTP API. It is a long-running process that subscribes to on-chain logs for the `sss_token` program and delivers events via webhook.

### Behavior

- Connects to the Solana RPC WebSocket endpoint (`RPC_WS_URL`).
- Subscribes to all logs for program ID `SSS_TOKEN_PROGRAM_ID`.
- Parses events using the Anchor `BorshCoder` and the compiled IDL.
- Delivers each event to `WEBHOOK_URL` via HTTP POST.
- Falls back to raw log parsing if the IDL is not compiled yet.

### Webhook Delivery

**Endpoint:** `WEBHOOK_URL` (configured via environment)

**Method:** `POST`

**Headers:**

| Header | Value |
|---|---|
| `Content-Type` | `application/json` |
| `X-SSS-Signature` | SHA-256(`WEBHOOK_SECRET` + body) in hex |

**Payload format:**

```json
{
  "event": "<EventName>",
  "data": { ... },
  "signature": "<TRANSACTION_SIGNATURE>",
  "timestamp": "2026-03-03T12:00:00.000Z"
}
```

### Event Payloads

**`StablecoinInitialized`**

```json
{
  "event": "StablecoinInitialized",
  "data": {
    "mint": "<MINT_PUBKEY>",
    "authority": "<AUTHORITY_PUBKEY>",
    "preset": "sss-2",
    "timestamp": 1709460000
  },
  "signature": "...",
  "timestamp": "2026-03-03T12:00:00.000Z"
}
```

**`TokensMinted`**

```json
{
  "event": "TokensMinted",
  "data": {
    "mint": "<MINT_PUBKEY>",
    "recipient": "<RECIPIENT_TOKEN_ACCOUNT>",
    "amount": 1000000,
    "minter": "<MINTER_PUBKEY>",
    "timestamp": 1709460000
  },
  "signature": "...",
  "timestamp": "2026-03-03T12:00:00.000Z"
}
```

**`TokensBurned`**

```json
{
  "event": "TokensBurned",
  "data": {
    "mint": "<MINT_PUBKEY>",
    "from": "<FROM_TOKEN_ACCOUNT>",
    "amount": 500000,
    "timestamp": 1709460000
  },
  "signature": "...",
  "timestamp": "2026-03-03T12:00:00.000Z"
}
```

**`AccountFrozen`**

```json
{
  "event": "AccountFrozen",
  "data": {
    "mint": "<MINT_PUBKEY>",
    "account": "<TOKEN_ACCOUNT>",
    "frozen": true,
    "timestamp": 1709460000
  },
  "signature": "...",
  "timestamp": "2026-03-03T12:00:00.000Z"
}
```

**`BlacklistUpdated`**

```json
{
  "event": "BlacklistUpdated",
  "data": {
    "mint": "<MINT_PUBKEY>",
    "address": "<WALLET_PUBKEY>",
    "blacklisted": true,
    "reason": "OFAC SDN match",
    "timestamp": 1709460000
  },
  "signature": "...",
  "timestamp": "2026-03-03T12:00:00.000Z"
}
```

**`TokensSeized`**

```json
{
  "event": "TokensSeized",
  "data": {
    "mint": "<MINT_PUBKEY>",
    "from": "<FROM_TOKEN_ACCOUNT>",
    "to": "<TO_TOKEN_ACCOUNT>",
    "amount": 10000000,
    "seizer": "<SEIZER_PUBKEY>",
    "timestamp": 1709460000
  },
  "signature": "...",
  "timestamp": "2026-03-03T12:00:00.000Z"
}
```

**`PauseChanged`**

```json
{
  "event": "PauseChanged",
  "data": {
    "mint": "<MINT_PUBKEY>",
    "paused": true,
    "authority": "<AUTHORITY_PUBKEY>",
    "timestamp": 1709460000
  }
}
```

**`AuthorityTransferred`**

```json
{
  "event": "AuthorityTransferred",
  "data": {
    "mint": "<MINT_PUBKEY>",
    "oldAuthority": "<OLD_PUBKEY>",
    "newAuthority": "<NEW_PUBKEY>",
    "timestamp": 1709460000
  }
}
```

### Verifying Webhook Signatures

```typescript
import { createHash } from "crypto";

app.post("/webhook", (req, res) => {
  const signature = req.headers["x-sss-signature"] as string;
  const body = JSON.stringify(req.body);
  const expected = createHash("sha256")
    .update(process.env.WEBHOOK_SECRET + body)
    .digest("hex");

  if (expected !== signature) {
    return res.status(401).json({ error: "Invalid signature" });
  }

  const { event, data, signature: txSig } = req.body;
  // Process event...
  res.json({ ok: true });
});
```

---

## compliance-service (port 3003)

### `GET /health`

```json
{
  "status": "ok",
  "service": "compliance-service"
}
```

---

### `POST /v1/compliance/blacklist`

Add an address to the on-chain blacklist. Immediately blocks all transfers via the transfer hook.

**Request body:**

```json
{
  "mint": "<MINT_PUBKEY>",
  "address": "<WALLET_PUBKEY>",
  "reason": "OFAC SDN 2026-03-03 — Sanctioned Entity Inc."
}
```

| Field | Type | Constraint | Description |
|---|---|---|---|
| `mint` | `string` | base58, 32+ chars | Mint address |
| `address` | `string` | base58, 32+ chars | Wallet address to blacklist |
| `reason` | `string` | 1-128 chars | Stored on-chain; use clear legal reference |

**Response (200):**

```json
{
  "success": true,
  "id": "blacklist-1709460000000",
  "mint": "<MINT_PUBKEY>",
  "action": "blacklisted",
  "address": "<WALLET_PUBKEY>",
  "reason": "OFAC SDN 2026-03-03",
  "performedBy": "<AUTHORITY_PUBKEY>",
  "signature": "<TRANSACTION_SIGNATURE>",
  "timestamp": "2026-03-03T12:00:00.000Z"
}
```

---

### `DELETE /v1/compliance/blacklist`

Remove an address from the blacklist. The on-chain record is preserved but deactivated.

**Request body:**

```json
{
  "mint": "<MINT_PUBKEY>",
  "address": "<WALLET_PUBKEY>"
}
```

**Response (200):**

```json
{
  "success": true,
  "id": "unblacklist-1709460000000",
  "action": "unblacklisted",
  "address": "<WALLET_PUBKEY>",
  "performedBy": "<AUTHORITY_PUBKEY>",
  "signature": "<TRANSACTION_SIGNATURE>",
  "timestamp": "2026-03-03T12:00:00.000Z"
}
```

---

### `GET /v1/compliance/blacklist?mint=<pubkey>&address=<pubkey>`

Check whether an address is currently blacklisted.

**Query parameters:**

| Parameter | Type | Required |
|---|---|---|
| `mint` | `string` | Yes |
| `address` | `string` | Yes |

**Response (200):**

```json
{
  "mint": "<MINT_PUBKEY>",
  "address": "<WALLET_PUBKEY>",
  "blacklisted": true,
  "entry": {
    "address": "<WALLET_PUBKEY>",
    "mint": "<MINT_PUBKEY>",
    "reason": "OFAC SDN 2026-03-03",
    "blacklistedAt": 1709460000,
    "blacklistedBy": "<AUTHORITY_PUBKEY>",
    "active": true,
    "bump": 254
  }
}
```

If not blacklisted: `"blacklisted": false, "entry": null`

---

### `POST /v1/compliance/seize`

Forcibly transfer tokens from a token account to a destination using the permanent delegate. Requires SSS-2 mint.

**Request body:**

```json
{
  "mint": "<MINT_PUBKEY>",
  "fromTokenAccount": "<SOURCE_TOKEN_ACCOUNT>",
  "toTokenAccount": "<DESTINATION_TOKEN_ACCOUNT>",
  "amount": "10000000"
}
```

| Field | Type | Constraint | Description |
|---|---|---|---|
| `mint` | `string` | base58 | Mint address |
| `fromTokenAccount` | `string` | base58 | Token account to seize from |
| `toTokenAccount` | `string` | base58 | Destination token account |
| `amount` | `string` | integer string | Amount in base units |

**Response (200):**

```json
{
  "success": true,
  "id": "seize-1709460000000",
  "action": "seized",
  "address": "<FROM_TOKEN_ACCOUNT>",
  "amount": "10000000",
  "performedBy": "<AUTHORITY_PUBKEY>",
  "signature": "<TRANSACTION_SIGNATURE>",
  "timestamp": "2026-03-03T12:00:00.000Z"
}
```

**Response (500) - SSS-2 not enabled:**

```json
{
  "error": "This instruction requires SSS-2 (compliance) configuration"
}
```

---

### `GET /v1/compliance/audit-log?mint=<pubkey>&action=<type>&limit=<n>`

Export the compliance audit trail, most recent entries first.

**Query parameters:**

| Parameter | Type | Required | Description |
|---|---|---|---|
| `mint` | `string` | Yes | Filter by mint |
| `action` | `string` | No | Filter by action type |
| `limit` | `number` | No | Max entries to return; default 100 |

Valid `action` values: `blacklisted`, `unblacklisted`, `seized`, `frozen`, `minted`, `burned`

**Response (200):**

```json
{
  "mint": "<MINT_PUBKEY>",
  "total": 3,
  "entries": [
    {
      "id": "seize-1709460100000",
      "mint": "<MINT_PUBKEY>",
      "action": "seized",
      "address": "<TOKEN_ACCOUNT>",
      "amount": "10000000",
      "performedBy": "<AUTHORITY>",
      "signature": "<SIG>",
      "timestamp": "2026-03-03T12:01:40.000Z"
    },
    {
      "id": "blacklist-1709460000000",
      "mint": "<MINT_PUBKEY>",
      "action": "blacklisted",
      "address": "<WALLET>",
      "reason": "OFAC SDN 2026-03-03",
      "performedBy": "<AUTHORITY>",
      "signature": "<SIG>",
      "timestamp": "2026-03-03T12:00:00.000Z"
    }
  ]
}
```

**Note:** The in-memory audit log in the current implementation resets on service restart. For production, replace the `auditLog` array in `compliance-service/src/routes/compliance.ts` with a persistent database (PostgreSQL, SQLite).
