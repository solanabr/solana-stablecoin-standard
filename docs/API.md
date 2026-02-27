# API Reference

## Overview

REST API documentation for SSS Token backend services.

## Base URLs

| Service | URL | Environment |
|---------|-----|-------------|
| API | `http://localhost:3000` | Development |
| API | `https://api.sss-token.io` | Production |
| Compliance | `http://localhost:3001` | Development |
| Compliance | `https://compliance.sss-token.io` | Production |

## Authentication

API uses API keys passed in header:

```
Authorization: Bearer {your-api-key}
```

## API Service

### Health Check

#### GET /health

Check service health.

**Response:**
```json
{
  "success": true,
  "data": {
    "status": "healthy",
    "timestamp": "2026-02-23T09:00:00Z",
    "service": "sss-token-api",
    "version": "0.1.0"
  }
}
```

#### GET /health/solana

Check Solana connection status.

**Response:**
```json
{
  "success": true,
  "data": {
    "network": "devnet",
    "slot": 444050000,
    "blockTime": 1700000000,
    "rpc": "https://api.devnet.solana.com"
  }
}
```

### Mint Operations

#### POST /api/mint

Queue a mint transaction.

**Request:**
```json
{
  "recipient": "7RDzYmYfq3ANoDYfPZYEvtDQZKHRRaVdzusqYGAJKmk9",
  "amount": "1000000",
  "authority": "FUTbzegEr8jH8T8UMztMv7Wo38931XSkMsuAB9CRW7FS"
}
```

**Parameters:**
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| recipient | string | Yes | Recipient address (base58) |
| amount | string | Yes | Amount in smallest unit |
| authority | string | No | Override authority |

**Response:**
```json
{
  "success": true,
  "data": {
    "signature": "5PSnerYeMjaRJXJW75JbnYsWQ2h1HBu17QBZs5ZMG8HC...",
    "recipient": "7RDzYmYfq3ANoDYfPZYEvtDQZKHRRaVdzusqYGAJKmk9",
    "amount": "1000000"
  }
}
```

**Errors:**
| Code | Status | Description |
|------|--------|-------------|
| 400 | Bad Request | Invalid address or amount |
| 429 | Rate Limited | Too many requests |
| 500 | Server Error | Transaction failed |

#### GET /api/mint/queue

Get pending mint operations.

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "jobId": "mint_1700000000_abc123",
      "type": "mint",
      "recipient": "7RDzYmYfq3ANoDYfPZYEvtDQZKHRRaVdzusqYGAJKmk9",
      "amount": "1000000",
      "status": "pending",
      "createdAt": 1700000000
    }
  ]
}
```

### Burn Operations

#### POST /api/burn

Queue a burn transaction.

**Request:**
```json
{
  "amount": "500000",
  "authority": "FUTbzegEr8jH8T8UMztMv7Wo38931XSkMsuAB9CRW7FS",
  "account": "7RDzYmYfq3ANoDYfPZYEvtDQZKHRRaVdzusqYGAJKmk9"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "signature": "2VyvowNDtD4HRbDy2cfUs9KVDbVTkEPmpWB8pZuLTV7q...",
    "amount": "500000"
  }
}
```

## Compliance Service

### Health Check

#### GET /health

**Response:**
```json
{
  "status": "healthy",
  "service": "compliance"
}
```

### Blacklist Checks

#### POST /check/blacklist

Check if address is blacklisted.

**Request:**
```json
{
  "address": "BadActor111111111111111111111111111111111"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "address": "BadActor111111111111111111111111111111111",
    "isBlacklisted": true,
    "details": {
      "signature": "abc123...",
      "added_at": "2026-02-20T10:00:00Z",
      "added_by": "FUTbzegEr8jH8T8UMztMv7Wo38931XSkMsuAB9CRW7FS"
    }
  }
}
```

### Whitelist Checks

#### POST /check/whitelist

Check if address is whitelisted.

**Request:**
```json
{
  "address": "VerifiedKYC1111111111111111111111111111111"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "address": "VerifiedKYC1111111111111111111111111111111",
    "isWhitelisted": true,
    "details": {
      "signature": "def456...",
      "added_at": "2026-02-18T14:00:00Z"
    }
  }
}
```

### Transfer Compliance

#### POST /check/transfer

Full compliance check for a transfer.

**Request:**
```json
{
  "source": "7RDzYmYfq3ANoDYfPZYEvtDQZKHRRaVdzusqYGAJKmk9",
  "destination": "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL",
  "amount": "1000000"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "source": {
      "address": "7RDzYmYfq3ANoDYfPZYEvtDQZKHRRaVdzusqYGAJKmk9",
      "isBlacklisted": false,
      "isWhitelisted": true
    },
    "destination": {
      "address": "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL",
      "isBlacklisted": false,
      "isWhitelisted": false
    },
    "amount": "1000000",
    "isCompliant": true,
    "shouldProceed": true,
    "responseTimeMs": 45
  }
}
```

### Batch Checks

#### POST /check/batch

Check compliance for multiple addresses.

**Request:**
```json
{
  "addresses": [
    "7RDzYmYfq3ANoDYfPZYEvtDQZKHRRaVdzusqYGAJKmk9",
    "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL",
    "BadActor111111111111111111111111111111111"
  ]
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "total": 3,
    "blocked": 1,
    "whitelisted": 1,
    "results": [
      {
        "address": "7RDzYmYfq3ANoDYfPZYEvtDQZKHRRaVdzusqYGAJKmk9",
        "isBlacklisted": false,
        "isWhitelisted": true,
        "status": "whitelisted"
      },
      {
        "address": "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL",
        "isBlacklisted": false,
        "isWhitelisted": false,
        "status": "standard"
      },
      {
        "address": "BadActor111111111111111111111111111111111",
        "isBlacklisted": true,
        "isWhitelisted": false,
        "status": "blocked"
      }
    ]
  }
}
```

### Statistics

#### GET /stats

Get compliance statistics.

**Response:**
```json
{
  "success": true,
  "data": {
    "blacklist": {
      "totalAddresses": 150
    },
    "whitelist": {
      "totalAddresses": 2500
    },
    "program": "FSkkSmrThcLpU9Uybrn4xcpbQKswUJn7KvoUQBsLPExD",
    "network": "devnet"
  }
}
```

## Error Responses

All errors follow this format:

```json
{
  "success": false,
  "error": "Invalid address format",
  "code": "INVALID_ADDRESS"
}
```

### Error Codes

| Code | HTTP | Description |
|------|------|-------------|
| `INVALID_ADDRESS` | 400 | Invalid Solana address |
| `INVALID_AMOUNT` | 400 | Amount must be positive integer |
| `RATE_LIMITED` | 429 | Too many requests |
| `UNAUTHORIZED` | 401 | Invalid API key |
| `NOT_FOUND` | 404 | Resource not found |
| `SERVER_ERROR` | 500 | Internal server error |

## Rate Limiting

### Headers

All responses include rate limit headers:

```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1700000900
```

### Limits

| Endpoint | Limit | Window |
|----------|-------|--------|
| /api/mint | 100 | 15 minutes |
| /api/burn | 100 | 15 minutes |
| /check/* | 1000 | 15 minutes |
| /stats | 50 | 15 minutes |

## Pagination

List endpoints support pagination:

**Request:**
```
GET /api/mint/queue?page=1&limit=20
```

**Response:**
```json
{
  "success": true,
  "data": [...],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 150,
    "pages": 8
  }
}
```

## Webhooks

### Configure Webhooks

```bash
curl -X POST http://localhost:3001/webhooks \
  -H "Authorization: Bearer {api-key}" \
  -d '{
    "url": "https://your-app.com/webhooks/sss",
    "events": ["transfer", "blacklist.add", "blacklist.remove"],
    "secret": "webhook-secret-key"
  }'
```

### Webhook Events

```json
{
  "event": "transfer",
  "timestamp": "2026-02-23T09:00:00Z",
  "data": {
    "signature": "5PSnerYeMjaRJXJW75JbnYsWQ2h1HBu17QBZs5ZMG8HC...",
    "source": "7RDzYmYfq3ANoDYfPZYEvtDQZKHRRaVdzusqYGAJKmk9",
    "destination": "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL",
    "amount": "1000000",
    "fee": "10000"
  },
  "signature": "HMAC-SHA256 of payload"
}
```

## SDK Example

### JavaScript/TypeScript

```typescript
import axios from 'axios';

const api = axios.create({
  baseURL: 'http://localhost:3000',
  headers: {
    'Authorization': 'Bearer your-api-key',
  },
});

// Mint tokens
const mint = await api.post('/api/mint', {
  recipient: '7RDzYmYfq3ANoDYfPZYEvtDQZKHRRaVdzusqYGAJKmk9',
  amount: '1000000',
});

// Check compliance
const compliance = await axios.post('http://localhost:3001/check/transfer', {
  source: '7RDzYmYfq3ANoDYfPZYEvtDQZKHRRaVdzusqYGAJKmk9',
  destination: 'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL',
  amount: '1000000',
});

if (compliance.data.data.isCompliant) {
  // Proceed with transfer
}
```

### cURL

```bash
# Mint
curl -X POST http://localhost:3000/api/mint \
  -H "Content-Type: application/json" \
  -d '{"recipient": "7RDz...", "amount": "1000000"}'

# Check blacklist
curl -X POST http://localhost:3001/check/blacklist \
  -H "Content-Type: application/json" \
  -d '{"address": "BadActor..."}'

# Batch check
curl -X POST http://localhost:3001/check/batch \
  -H "Content-Type: application/json" \
  -d '{"addresses": ["addr1", "addr2"]}'
```

## Testing

### Postman Collection

Import the Postman collection: `docs/postman/sss-token-api.json`

### Local Testing

```bash
# Start services
docker-compose up -d

# Test API
curl http://localhost:3000/health

# Test Compliance
curl http://localhost:3001/health
```

## Support

- API issues: api@your-org.com
- Compliance: compliance@your-org.com
- Docs: https://docs.sss-token.io

## References

- [Architecture Overview](./ARCHITECTURE.md)
- [SDK Documentation](./SDK.md)
- [Operations Guide](./OPERATIONS.md)
- [Compliance Guide](./COMPLIANCE.md)
