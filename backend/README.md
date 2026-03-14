# SSS Backend API

Professional backend services for the Solana Stablecoin Standard (SSS) protocol.

## 🚀 Features

- **RESTful API** - Complete token and transaction management
- **Real-time Indexer** - WebSocket subscriptions for on-chain events
- **Webhook System** - Event-driven notifications with HMAC signatures
- **Analytics Engine** - Comprehensive metrics and reporting
- **Swagger Documentation** - Interactive API explorer

## 📋 Prerequisites

- Node.js 18+
- Redis (optional, for production queues)
- PostgreSQL (optional, for persistent storage)

## 🛠️ Installation

```bash
cd backend
npm install
```

## ⚙️ Configuration

Create a `.env` file:

```env
# Server
PORT=3001
NODE_ENV=development

# Solana
SOLANA_RPC_URL=https://api.devnet.solana.com
SOLANA_NETWORK=devnet

# Database (optional)
DATABASE_URL=postgresql://user:pass@localhost:5432/sss

# Redis (optional)
REDIS_URL=redis://localhost:6379

# Security
CORS_ORIGIN=http://localhost:3000
API_KEY_SECRET=your-secret-key

# Logging
LOG_LEVEL=info
```

## 🏃 Running

### Development

```bash
npm run dev
```

### Production

```bash
npm run build
npm start
```

## 📚 API Documentation

Once running, visit: http://localhost:3001/api/docs

## 🔗 API Endpoints

### Health

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/health` | Health check |
| GET | `/api/v1/health/ready` | Readiness probe |
| GET | `/api/v1/health/live` | Liveness probe |

### Tokens

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/tokens` | List SSS tokens |
| GET | `/api/v1/tokens/:mint` | Get token details |
| GET | `/api/v1/tokens/:mint/holders` | Get token holders |
| GET | `/api/v1/tokens/:mint/extensions` | Get token extensions |

### Transactions

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/transactions` | List transactions |
| GET | `/api/v1/transactions/:signature` | Get transaction |
| GET | `/api/v1/transactions/account/:address` | Account transactions |
| GET | `/api/v1/transactions/confidential` | CT transactions |

### Webhooks

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/webhooks` | List webhooks |
| POST | `/api/v1/webhooks` | Register webhook |
| GET | `/api/v1/webhooks/:id` | Get webhook |
| PATCH | `/api/v1/webhooks/:id` | Update webhook |
| DELETE | `/api/v1/webhooks/:id` | Delete webhook |
| POST | `/api/v1/webhooks/:id/test` | Test webhook |
| GET | `/api/v1/webhooks/events` | Available events |

### Analytics

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/analytics/overview` | Dashboard overview |
| GET | `/api/v1/analytics/supply` | Supply history |
| GET | `/api/v1/analytics/transactions` | Transaction analytics |
| GET | `/api/v1/analytics/volume` | Volume analytics |
| GET | `/api/v1/analytics/holders` | Holder distribution |
| GET | `/api/v1/analytics/confidential` | CT analytics |
| GET | `/api/v1/analytics/fees` | Fee analytics |
| GET | `/api/v1/analytics/network` | Network status |

## 🔔 Webhook Events

Subscribe to these events:

| Event | Description |
|-------|-------------|
| `transfer` | Token transfer completed |
| `mint` | New tokens minted |
| `burn` | Tokens burned |
| `freeze` | Account frozen/unfrozen |
| `confidential_deposit` | CT deposit completed |
| `confidential_transfer` | CT transfer completed |
| `confidential_withdraw` | CT withdrawal completed |
| `compliance_alert` | Compliance check triggered |
| `reserve_update` | Reserve status changed |

### Webhook Payload

```json
{
  "event": "transfer",
  "timestamp": "2026-03-12T10:30:00Z",
  "signature": "5J7YB...",
  "data": {
    "from": "Address1...",
    "to": "Address2...",
    "amount": "1000000",
    "mint": "SSSUSD..."
  }
}
```

### Signature Verification

```typescript
const crypto = require('crypto');

function verifyWebhook(payload, signature, secret) {
  const expected = crypto
    .createHmac('sha256', secret)
    .update(JSON.stringify(payload))
    .digest('hex');
  
  return signature === `sha256=${expected}`;
}
```

## 🏗️ Architecture

```
src/
├── index.ts              # Entry point
├── middleware/
│   └── errorHandler.ts   # Error handling
├── routes/
│   ├── analytics.ts      # Analytics endpoints
│   ├── health.ts         # Health checks
│   ├── tokens.ts         # Token endpoints
│   ├── transactions.ts   # Transaction endpoints
│   └── webhooks.ts       # Webhook management
├── services/
│   └── indexer.ts        # Solana indexer
└── utils/
    └── logger.ts         # Winston logger
```

## 🔐 Security

- Rate limiting: 100 req/min (configurable)
- CORS protection
- Helmet security headers
- HMAC webhook signatures
- Input validation with Zod

## 📊 Monitoring

- Winston logging to console and files
- Structured JSON logs in production
- Health check endpoints for k8s

## 🧪 Testing

```bash
npm test
```

## 📄 License

MIT
