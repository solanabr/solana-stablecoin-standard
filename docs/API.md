# Backend REST API Reference

The SSS backend service provides a lightweight HTTP API for coordinating fiat-stablecoin lifecycle operations. It wraps the `@stbr/sss-sdk` and exposes endpoints suitable for integration with banking middleware, custody systems, and internal tooling.

**Important:** The backend holds a hot wallet (the keypair at `ANCHOR_WALLET`). It must be deployed behind a firewall or VPN and **must not be exposed to the public internet**. There is no authentication layer — access control is enforced at the network perimeter.

---

## Base URL

```
http://localhost:3000
```

In production, place behind an HTTPS reverse proxy (nginx, Caddy, AWS ALB, etc.).

---

## Authentication

None. The service is designed for internal use only. Deploy within a private network, VPC, or behind a VPN. All incoming requests are treated as trusted.

---

## Endpoints

### `GET /health`

Health check. Returns service status and the configured mint address.

**Request:** No parameters required.

**Response 200:**
```json
{
  "status": "ok",
  "timestamp": "2026-03-02T14:30:00.000Z",
  "mint": "Aaw7RSm8fXXAfvDy9wS1FimFEmnHkzYtDmZCRgZg9pVm"
}
```

**curl:**
```bash
curl http://localhost:3000/health
```

---

### `GET /supply`

Returns the current total supply of the configured stablecoin mint.

**Query parameters:** None (uses `SSS_MINT` environment variable)

**Response 200:**
```json
{
  "mint": "Aaw7RSm8fXXAfvDy9wS1FimFEmnHkzYtDmZCRgZg9pVm",
  "supply": "100000000000000",
  "decimals": 6,
  "uiAmount": "100000000.000000"
}
```

**Response 400** (SSS_MINT not configured):
```json
{ "error": "SSS_MINT not configured" }
```

**Response 500:**
```json
{ "error": "<error message from RPC or SDK>" }
```

**curl:**
```bash
curl http://localhost:3000/supply
```

---

### `POST /mint`

Mints tokens to a destination token account. The service's signing keypair must hold the `minter` or `master_authority` role.

**Request body (JSON):**
```json
{
  "destination": "<token-account-address>",
  "amount": "<base-units-as-string>"
}
```

| Field         | Type   | Required | Description                                        |
|---------------|--------|----------|----------------------------------------------------|
| `destination` | string | Yes      | Destination associated token account address       |
| `amount`      | string | Yes      | Amount in base units (string to avoid JS precision)|

**Response 200:**
```json
{
  "success": true,
  "signature": "4xrBnqKSCi8v3oMxRsPn7FbqHeJgZtKwUdVjL9mHNkP...",
  "amount": "1000000000"
}
```

**Response 400** (missing fields):
```json
{ "error": "Required: destination, amount" }
```

**Response 500:**
```json
{ "error": "Unauthorized: caller does not have required role" }
```

**curl:**
```bash
curl -X POST http://localhost:3000/mint \
  -H "Content-Type: application/json" \
  -d '{
    "destination": "DpRueBHHhrquxs4BTd8beMy7W2cAEpsu8crznUB4fFCi",
    "amount": "1000000000"
  }'
```

---

### `POST /burn`

Burns tokens from a source token account. The service's signing keypair must hold the `burner` or `master_authority` role.

**Request body (JSON):**
```json
{
  "source": "<token-account-address>",
  "amount": "<base-units-as-string>"
}
```

| Field    | Type   | Required | Description                                  |
|----------|--------|----------|----------------------------------------------|
| `source` | string | Yes      | Source token account to burn from            |
| `amount` | string | Yes      | Amount in base units                         |

**Response 200:**
```json
{
  "success": true,
  "signature": "5ysCmrLRDi9w4pNyQsTm8GbqHfKhZuLwVdEjN0oIPkR...",
  "amount": "500000000"
}
```

**Response 400:**
```json
{ "error": "Required: source, amount" }
```

**curl:**
```bash
curl -X POST http://localhost:3000/burn \
  -H "Content-Type: application/json" \
  -d '{
    "source": "DpRueBHHhrquxs4BTd8beMy7W2cAEpsu8crznUB4fFCi",
    "amount": "500000000"
  }'
```

---

### `POST /compliance/blacklist`

Adds a wallet address to the blacklist (SSS-2 only). The service's signing keypair must hold the `blacklister` or `master_authority` role. After this call, the transfer hook will reject any transfer to or from the specified address.

**Request body (JSON):**
```json
{
  "address": "<wallet-address>",
  "reason": 1
}
```

| Field     | Type   | Required | Description                                   |
|-----------|--------|----------|-----------------------------------------------|
| `address` | string | Yes      | Wallet address to blacklist                   |
| `reason`  | number | No       | Reason code 0–255 (default: 0 = unspecified)  |

**Response 200:**
```json
{
  "success": true,
  "signature": "3qLmPkRJSh7x2nKwBfTv9GcuNeZhYdWjV0oIMpEaA...",
  "address": "BadActorWa11et111111111111111111111111111111"
}
```

**Response 400:**
```json
{ "error": "Required: address" }
```

**Response 500:**
```json
{ "error": "SSS-2 feature not enabled for this token" }
```

**curl:**
```bash
curl -X POST http://localhost:3000/compliance/blacklist \
  -H "Content-Type: application/json" \
  -d '{
    "address": "BadActorWa11et111111111111111111111111111111",
    "reason": 1
  }'
```

---

### `GET /compliance/check`

Checks whether a wallet address is currently blacklisted.

**Query parameters:**

| Parameter | Required | Description              |
|-----------|----------|--------------------------|
| `address` | Yes      | Wallet address to check  |

**Response 200:**
```json
{
  "address": "SomeWa11et111111111111111111111111111111111",
  "blacklisted": false
}
```

Or for a blacklisted address:
```json
{
  "address": "BadActorWa11et111111111111111111111111111111",
  "blacklisted": true
}
```

**Response 400:**
```json
{ "error": "Required: address query param" }
```

**curl:**
```bash
curl "http://localhost:3000/compliance/check?address=SomeWa11et111111111111111111111111111111111"
```

---

## Error Responses

All error responses follow this schema:

```json
{ "error": "<human-readable error message>" }
```

Common HTTP status codes:

| Status | Meaning                                                        |
|--------|----------------------------------------------------------------|
| 200    | Success                                                        |
| 400    | Bad request (missing required field, SSS_MINT not configured)  |
| 404    | Endpoint not found                                             |
| 500    | Server error (RPC failure, program error, keypair issue)       |

Program-level errors are propagated directly in the `error` field. For example:
- `"Unauthorized: caller does not have required role"` — keypair is not the minter/burner/etc.
- `"Transfers are currently paused"` — global pause is active
- `"Maximum supply would be exceeded"` — mint would exceed max_supply
- `"SSS-2 feature not enabled for this token"` — compliance endpoint on SSS-1 token

---

## Environment Variables

| Variable              | Required | Default                         | Description                              |
|-----------------------|----------|---------------------------------|------------------------------------------|
| `ANCHOR_WALLET`       | Yes      | `~/.config/solana/id.json`      | Absolute path to signing keypair JSON    |
| `ANCHOR_PROVIDER_URL` | Yes      | `https://api.devnet.solana.com` | Solana RPC endpoint                      |
| `PORT`                | No       | `3000`                          | HTTP listen port                         |
| `SSS_MINT`            | Yes      | —                               | Mint address the backend manages         |

The service will start without `SSS_MINT` set but all operational endpoints will return 400 until it is configured.

---

## Logging

The service logs structured JSON to stdout:

```json
{"level":"info","method":"POST","path":"/mint","ts":"2026-03-02T14:30:00.000Z"}
{"level":"info","method":"POST","path":"/mint","ms":1423}
{"level":"error","error":"Unauthorized: caller does not have required role"}
```

Pipe to a log aggregator (Datadog, Loki, CloudWatch) for production observability.

---

## Docker Deployment

### Build and run manually

```bash
# Build image
cd backend
docker build -t sss-backend .

# Run
docker run -d \
  --name sss-backend \
  -p 3000:3000 \
  -e ANCHOR_PROVIDER_URL=https://api.mainnet-beta.solana.com \
  -e ANCHOR_WALLET=/wallets/keypair.json \
  -e SSS_MINT=Aaw7RSm8fXXAfvDy9wS1FimFEmnHkzYtDmZCRgZg9pVm \
  -e PORT=3000 \
  -v /secure/wallets:/wallets:ro \
  sss-backend
```

### Using docker-compose

A `docker-compose.yml` is provided at the repository root:

```bash
# Set required environment variables
export ANCHOR_PROVIDER_URL=https://api.mainnet-beta.solana.com
export SSS_MINT=Aaw7RSm8fXXAfvDy9wS1FimFEmnHkzYtDmZCRgZg9pVm
export WALLET_DIR=/secure/wallets   # directory containing keypair.json

# Start
docker-compose up -d

# Check health
curl http://localhost:3000/health

# Tail logs
docker-compose logs -f sss-backend

# Stop
docker-compose down
```

The compose file mounts the wallet directory read-only at `/wallets` inside the container, and configures a health check that polls `/health` every 30 seconds.

### Keypair file format

The keypair file must be a JSON array of 64 bytes:

```json
[12,34,56,...,78,90]
```

Generate one with:
```bash
solana-keygen new --outfile /secure/wallets/keypair.json
```

**Security:** Never commit this file. Store it in a secrets manager or encrypted volume. Use a dedicated keypair with only the minimum required role (e.g., only `minter` role, not `master_authority`).

---

## Production Checklist

- [ ] Deploy behind HTTPS reverse proxy
- [ ] Restrict inbound access to VPC/VPN only (no public internet)
- [ ] Use a dedicated keypair with minimum-privilege role
- [ ] Store keypair in secrets manager (AWS Secrets Manager, HashiCorp Vault, etc.)
- [ ] Configure a premium or private RPC endpoint (not public devnet)
- [ ] Enable structured log shipping to your observability platform
- [ ] Set up alerting on error-level log entries
- [ ] Test health check endpoint in your deployment pipeline
