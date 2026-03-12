# Backend API Reference

All services run behind `docker compose up`. Default ports: mint-service=3001, indexer=3002, compliance=3003.

## Mint Service (port 3001)

### Health

```
GET /health
-> { status: "ok", service: "sss-mint-service", ts: "..." }
```

### Create Mint Request

```
POST /api/mint/request
Body: { recipient: string, amount: string, memo?: string }
-> { id: string, status: "pending" }
```

### Get Mint Request

```
GET /api/mint/request/:id
-> { id, status, recipient, amount, memo, createdAt, ... }
```

### Execute Mint Request

```
POST /api/mint/request/:id/execute
-> { id, status: "completed", txSignature: string, ... }
```

### Create Burn Request

```
POST /api/burn/request
Body: { tokenAccount: string, amount: string, memo?: string }
-> { id: string, status: "pending" }
```

---

## Indexer (port 3002)

### Health

```
GET /health
-> { status: "ok", service: "sss-indexer", ts: "..." }
```

### All Events

```
GET /events
-> [{ type: string, data: string, ts: string }, ...]
```

### Events by Type

```
GET /events/:type
-> [...]
```

---

## Compliance Service (port 3003)

### Health

```
GET /health
-> { status: "ok", service: "sss-compliance", ts: "..." }
```

### Add to Blacklist (pending review)

```
POST /api/blacklist/add
Body: {
  mint: string,
  address: string,
  reason: string,
  operatorId?: string
}
-> { id: string, status: "pending_review" }
```

### Approve Blacklist Request

```
POST /api/blacklist/:id/approve
-> { id, status: "approved", approvedAt: string, ... }
```

### List Pending Blacklist Actions

```
GET /api/blacklist/
-> [{ id, type, mint, address, reason, status, createdAt, ... }, ...]
```

### Audit Trail

```
GET /api/audit/
GET /api/audit/?action=blacklist_add_approved
-> [{ action, ts, address, operator, id, ... }, ...]
```

### Export Audit Trail (CSV)

```
GET /api/audit/export
-> CSV file download
```

### Sanctions Screening

```
POST /api/screening/check
Body: { address: string }
-> { address, riskScore, flags, provider, ts }
```

---

## Environment Variables

| Service | Variable | Default | Description |
|---------|----------|---------|-------------|
| All | `RPC_URL` | devnet | Solana RPC endpoint |
| All | `LOG_LEVEL` | info | Log level |
| mint-service | `PORT` | 3001 | HTTP port |
| mint-service | `MINT_AUTHORITY_KEYPAIR` | - | Base58 keypair for signing mint txs |
| indexer | `PORT` | 3002 | HTTP port |
| indexer | `WEBHOOK_URL` | - | URL to POST events to |
| indexer | `WEBHOOK_RETRIES` | 3 | Max webhook retry attempts |
| compliance | `PORT` | 3003 | HTTP port |
| compliance | `SCREENING_API_KEY` | - | Sanctions screening API key |
| compliance | `SCREENING_PROVIDER` | mock | Provider: chainalysis, elliptic, trm, mock |
