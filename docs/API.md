# Backend API Reference

Base URL: `http://localhost:3000/api/v1`

## Health

### GET /health

Returns service health status.

**Response:**
```json
{
  "status": "healthy",
  "version": "0.1.0",
  "solana": {
    "rpcUrl": "https://api.devnet.solana.com",
    "currentSlot": 123456789
  },
  "uptime": 3600.5,
  "timestamp": "2024-01-15T10:00:00Z"
}
```

### GET /health/ready

Returns readiness status.

**Response:**
```json
{
  "ready": true
}
```

## Operations

### POST /operations/mint

Create a mint request.

**Request:**
```json
{
  "amount": "1000000000",
  "recipient": "wallet_address"
}
```

**Response (201):**
```json
{
  "id": "uuid",
  "type": "mint",
  "amount": "1000000000",
  "recipient": "wallet_address",
  "status": "pending",
  "createdAt": "2024-01-15T10:00:00Z",
  "updatedAt": "2024-01-15T10:00:00Z"
}
```

### POST /operations/burn

Create a burn request.

**Request:**
```json
{
  "amount": "500000000"
}
```

**Response (201):**
```json
{
  "id": "uuid",
  "type": "burn",
  "amount": "500000000",
  "status": "pending",
  "createdAt": "2024-01-15T10:00:00Z",
  "updatedAt": "2024-01-15T10:00:00Z"
}
```

### GET /operations/request/:id

Get request status.

**Response:**
```json
{
  "id": "uuid",
  "type": "mint",
  "amount": "1000000000",
  "recipient": "wallet_address",
  "status": "completed",
  "signature": "tx_signature",
  "createdAt": "2024-01-15T10:00:00Z",
  "updatedAt": "2024-01-15T10:00:05Z"
}
```

### GET /operations/requests

List all requests.

**Query Parameters:**
- `type` (optional): `mint` or `burn`

**Response:**
```json
[
  { "id": "...", "type": "mint", "status": "completed", ... },
  { "id": "...", "type": "burn", "status": "pending", ... }
]
```

### PATCH /operations/request/:id/status

Update request status.

**Request:**
```json
{
  "status": "completed",
  "signature": "tx_signature"
}
```

**Status values:** `pending`, `verifying`, `executing`, `completed`, `failed`

## Compliance (SSS-2)

### POST /compliance/screen

Screen an address for sanctions.

**Request:**
```json
{
  "address": "wallet_address"
}
```

**Response:**
```json
{
  "flagged": false,
  "source": "chainalysis",
  "details": "No match found"
}
```

### POST /compliance/record

Record a compliance action.

**Request:**
```json
{
  "action": "blacklist_add",
  "target": "wallet_address",
  "reason": "OFAC SDN match",
  "authority": "operator_address",
  "signature": "tx_signature",
  "metadata": {}
}
```

**Action values:** `blacklist_add`, `blacklist_remove`, `seize`, `freeze`, `thaw`, `screening`

### GET /compliance/audit-trail

Query the audit trail.

**Query Parameters:**
- `action` (optional): Filter by action type
- `target` (optional): Filter by target address
- `from` (optional): ISO date string
- `to` (optional): ISO date string
- `format` (optional): `json` (default) or `csv`

**Response (JSON):**
```json
[
  {
    "id": "uuid",
    "action": "blacklist_add",
    "target": "wallet_address",
    "reason": "OFAC match",
    "authority": "operator_address",
    "signature": "tx_signature",
    "timestamp": "2024-01-15T10:00:00Z"
  }
]
```

### GET /compliance/audit-trail/export

Export the full audit trail.

**Query Parameters:**
- `format`: `json` or `csv`

**Response:** File download with appropriate Content-Type and Content-Disposition headers.

## Error Responses

All error responses follow this format:

```json
{
  "error": "Description of what went wrong"
}
```

| Status | Meaning |
|--------|---------|
| 400 | Bad request — missing or invalid parameters |
| 404 | Resource not found |
| 500 | Internal server error |
| 503 | Service unavailable (health check) |
