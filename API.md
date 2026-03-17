# API

The backend API is implemented in `backend/crates/api` and is backed by Postgres (events, lifecycle_requests, webhooks).

Base URL defaults to `http://127.0.0.1:8080`.

## Health

### `GET /healthz`

Returns process liveness.

Response:

```json
{ "status": "ok" }
```

### `GET /readyz`

Returns readiness after a database check.

Response:

```json
{ "status": "ready" }
```

## Events

### `GET /v1/mints/:mint/events`

Returns indexed events for the mint with optional filters, sorting, and pagination.

Query parameters:

| Param        | Type   | Description                                      |
| ------------ | ------ | ------------------------------------------------ |
| event_type   | string | Filter by event_type (e.g. TokensMinted)         |
| program_id   | string | Filter by program_id                             |
| tx_signature | string | Exact tx match                                   |
| slot_min     | int    | Slot >= value                                    |
| slot_max     | int    | Slot <= value                                    |
| from         | ISO8601| block_time >= value                              |
| to           | ISO8601| block_time <= value                              |
| sort         | string | `slot`, `block_time`, or `created_at` (default)  |
| order        | string | `asc` or `desc` (default)                        |
| limit        | int    | Max results (default: 100, max: 500)             |
| offset       | int    | Skip N results (pagination)                      |

Response:

```json
{
  "events": [
    {
      "id": 1,
      "event_type": "TokensMinted",
      "program_id": "...",
      "mint": "...",
      "tx_signature": "...",
      "slot": 12345,
      "block_time": "2026-03-14T12:00:00Z",
      "instruction_index": 0,
      "data": { "mint": "...", "amount": "1000000" },
      "created_at": "2026-03-14T12:00:00Z"
    }
  ],
  "total": 42
}
```

## Lifecycle Requests (Mint / Burn)

Mutating routes create lifecycle requests. Worker execution is controlled by `SSS_RUN_WORKERS=1`.

Request body for mint and burn:

```json
{
  "mint": "mint-address",
  "recipient": "wallet-address",
  "token_account": "token-account-address",
  "amount": 1000000,
  "minter": "minter-address",
  "reason": "issuer action",
  "idempotency_key": "unique-key",
  "requested_by": "ops@example.com"
}
```

- `recipient`: Required for mint (wallet to receive tokens). Optional for burn.
- `token_account`: Optional. For mint, defaults to recipient's ATA. For burn, which account to burn from.
- `amount`: Required. Positive integer.
- `minter`: Optional. For mint, the minter authority.
- `idempotency_key`: Optional. Prevents duplicate requests.

### `POST /v1/mint-requests`

Creates a lifecycle request with `type = mint`.

### `POST /v1/burn-requests`

Creates a lifecycle request with `type = burn`.

### `GET /v1/operations/:id`

Returns a lifecycle request. `id` is a string (UUID).

Response:

```json
{
  "request": {
    "id": "uuid",
    "type": "mint",
    "status": "requested",
    "mint": "...",
    "recipient": "...",
    "token_account": null,
    "amount": "1000000",
    "minter": null,
    "reason": "...",
    "idempotency_key": "...",
    "requested_by": "...",
    "approved_by": null,
    "tx_signature": null,
    "error": null,
    "created_at": "...",
    "updated_at": "..."
  }
}
```

Status values: `requested`, `approved`, `signing`, `submitted`, `finalized`, `failed`, `cancelled`.

### `POST /v1/operations/:id/approve`

Approves a lifecycle request (status must be `requested`).

Request body:

```json
{
  "approved_by": "approver@example.com"
}
```

### `POST /v1/operations/:id/execute`

Returns `202 Accepted` if the request is `approved` or `submitted`. Signals readiness for worker execution.

## Webhooks

### `POST /v1/webhooks/subscriptions`

Registers a webhook subscription.

Request body:

```json
{
  "name": "compliance-sink",
  "url": "https://example.com/hooks/sss",
  "events": [
    "AddressBlacklisted",
    "TokensSeized",
    "transfer_rejected_source_blacklisted"
  ],
  "secret": "shared-secret"
}
```

- `name`: Optional. For UI/ops.
- `events`: Array of event_type strings to subscribe to.
- `secret`: Optional. Used for HMAC-SHA256 signature in `x-sss-signature` header.

## Testing with DevNet

1. **Create credentials** (if needed): `./scripts/devnet-e2e.sh` creates an SSS-1 preset and writes `tests/devnet/fixtures/e2e-credentials.json`.

2. **Run API** with workers and signer:
   ```bash
   DATABASE_URL="postgres://user@127.0.0.1:5432/sss_backend" \
   SSS_RUN_WORKERS=1 \
   SSS_AUTHORITY_KEYPAIR=tests/devnet/fixtures/e2e-authority.json \
   SOLANA_RPC_URL="https://devnet.helius-rpc.com/?api-key=YOUR_KEY" \
   SSS_STABLECOIN_PROGRAM_ID=C7k7FTRLGLB5FJS7hWrpjqRiwmj5Px9DzMQUeouAxJ9r \
   cargo run -p sss-api
   ```

3. **Run indexer** (in another terminal) to populate events:
   ```bash
   DATABASE_URL="postgres://user@127.0.0.1:5432/sss_backend" \
   SOLANA_RPC_URL="..." SSS_STABLECOIN_PROGRAM_ID=... SSS_TRANSFER_HOOK_PROGRAM_ID=... \
   SSS_RUN_INDEXER=1 ./scripts/devnet-e2e.sh
   ```
   Or run the indexer standalone for 30s: `timeout 30 cargo run -p sss-indexer`.

4. **Smoke test** (API must be running):
   ```bash
   ./scripts/devnet-api-smoke.sh
   ```

5. **CLI** (set `SSS_API_URL` or `api_url` in config):
   ```bash
   SSS_API_URL=http://127.0.0.1:8080 sss-token mint RECIPIENT 1000000 --mint MINT
   SSS_API_URL=http://127.0.0.1:8080 sss-token operation approve REQUEST_ID --approved-by ops
   SSS_API_URL=http://127.0.0.1:8080 sss-token operation execute REQUEST_ID
   SSS_API_URL=http://127.0.0.1:8080 sss-token audit-log --mint MINT --action mint
   ```
