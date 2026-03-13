# Backend API Reference

Backend services for the Solana Stablecoin Standard: mint/burn API, operations, compliance, and optional indexer/webhook.

## Mint/Burn Service

HTTP server (default port 3000). Environment: `RPC_URL`, `KEYPAIR_PATH`, `MINT_ADDRESS`, `PORT`, `API_KEY` (optional), `CORS_ORIGIN` (optional, default `*`), `AUDIT_FROM_CHAIN` (optional, default `true` — enable in-process event listener), `RUN_EVENT_LISTENER` (optional, default `true` — subscribe to program logs for audit). Security: Helmet (headers) and CORS are enabled; configure `CORS_ORIGIN` for production.

**Request ID:** Every response includes an `X-Request-Id` header (generated per request or from client `X-Request-Id`).

**Auth:** If `API_KEY` is set, protected routes require the `X-API-Key` header to match. Missing or invalid key returns 401 `{ error: "Unauthorized" }`. Unprotected: `GET /health`, `GET /status/:mint`.

**Rate limit:** Protected routes are limited to 30 requests per minute per client (by IP). Exceeded returns 429 `{ error: "Too many requests" }`.

**Input validation:** All operation and compliance request bodies/query params are validated (Zod). Invalid input returns 400 `{ error: "Validation failed", details }`.

**Error taxonomy:** Responses are distinguished by status: **401** — missing or invalid `X-API-Key` (auth). **403** — forbidden (e.g. blocked by compliance screening). **400** — validation failure (body/query) with `details`. **502** — on-chain or transaction failure (e.g. simulation failed, program error, insufficient funds, role check); message is sanitized. **500** — server or configuration error (e.g. `MINT_ADDRESS` not set).

### Endpoints

- **GET /health**  
  Returns `{ status: "ok", rpc, mint }`. No auth.

- **GET /status/:mint**  
  Returns stablecoin status for the given mint (path param). No auth.  
  Response: `{ mint, authority, name, symbol, uri, decimals, paused, totalMinted, totalBurned, supply, preset ("SSS-1" | "SSS-2"), enablePermanentDelegate, enableTransferHook, defaultAccountFrozen }`.  
  All numeric amounts are decimal strings. Returns 400 if mint is missing, 500 if the mint is not a valid SSS stablecoin.

- **POST /mint-request**  
  Request mint. Body (JSON): `{ "recipient": "<pubkey>", "amount": "<number or string>", "minter": "<pubkey> (optional)" }`.  
  If `minter` is omitted, the keypair at `KEYPAIR_PATH` is used as minter.  
  Recipient (and minter when provided) are screened against blacklist and optional `COMPLIANCE_SCREENING_URL`; if blocked, returns 403 `{ error: "Blocked" }` and no mint is performed.  
  Returns `{ success: true, signature: "<tx sig>" }` or `{ error: "<message>" }` with status 400/403/500.

- **POST /burn-request**  
  Request burn. Body (JSON): `{ "amount": "<number or string>", "burner": "<pubkey> (optional)" }`.  
  If `burner` is omitted, the keypair at `KEYPAIR_PATH` is used.  
  Burner is screened; if blocked, returns 403 `{ error: "Blocked" }`.  
  Returns `{ success: true, signature: "<tx sig>" }` or `{ error: "<message>" }` with status 400/403/500.

### Operations (protected)

- **POST /operations/freeze**  
  Body: `{ "mint": "<pubkey>", "account": "<token account pubkey>" }`. Freezes the token account. Backend keypair must hold pauser or freezer role.

- **POST /operations/thaw**  
  Body: `{ "mint": "<pubkey>", "account": "<token account pubkey>" }`. Thaws the token account.

- **POST /operations/pause**  
  Body: `{ "mint": "<pubkey>" }`. Pauses the stablecoin mint.

- **POST /operations/unpause**  
  Body: `{ "mint": "<pubkey>" }`. Unpauses the stablecoin mint.

- **POST /operations/seize**  
  Body: `{ "mint": "<pubkey>", "from": "<owner pubkey>", "to": "<owner pubkey>", "amount": "<number or string>" }`.  
  Derives source and destination token accounts from mint and owner pubkeys; seizes full source balance to destination. `amount` is recorded in the audit log. Backend keypair must hold seizer role (SSS-2).

- **POST /operations/roles**  
  Body: `{ "mint": "<pubkey>", "holder": "<pubkey>", "roles": { "minter": boolean?, "burner": boolean?, "pauser": boolean?, "freezer": boolean?, "blacklister": boolean?, "seizer": boolean? } }`.  
  Grants or updates roles for the holder. Backend keypair must be the stablecoin authority. Omitted role flags default to false. Used by the TUI Roles tab.

All operations return `{ success: true, signature: "<tx sig>" }` or `{ error: "<message>" }` with status 400/500.

### Fiat-to-stablecoin flow

1. Off-chain: verify the user (KYC, limits, etc.).
2. Call `POST /mint-request` with recipient and amount.
3. Log the returned signature and any metadata for audit.
4. For redeem: verify and call `POST /burn-request` with amount (and optionally burner).

## Event listener (in-process)

The backend subscribes to program logs (`connection.onLogs`) for the SSS token program on startup. It parses Anchor events (TokensMinted, TokensBurned, AccountFrozen, etc.) into structured audit entries and adds them to the audit store. When `WEBHOOK_URL` is set, parsed events are POSTed to the webhook with retry logic.

- **Env:** `RUN_EVENT_LISTENER` (default `true` — set to `false` to disable), `AUDIT_FROM_CHAIN` (default `true` — set to `false` to disable), `WEBHOOK_URL` (optional), `WEBHOOK_MAX_RETRIES` (default 5), `WEBHOOK_TIMEOUT_MS` (default 10000), `SSS_TOKEN_PROGRAM_ID` (optional, default SSS program ID).
- **Payload (POST to WEBHOOK_URL):** `{ type, signature, programId, eventName, data }` (structured parsed event, not raw logs).
- **Audit types from chain:** `mint`, `burn`, `freeze`, `thaw`, `pause`, `unpause`, `blacklist_add`, `blacklist_remove`, `seize`, `roles`, `authority_transfer`, `minter_update`, `init`.

## Standalone indexer (optional)

A separate indexer container (`node dist/indexer.js`) subscribes to program logs and POSTs raw `{ type: "program_logs", programId, signature, logs, err }` to `WEBHOOK_URL`. Use when you need indexer-only (no API) or to forward raw logs to another service.

## Docker

From repo root, `docker compose up` starts both the **mint/burn API** and the **event indexer**.

```bash
# Optional: copy keypair for mint/burn
mkdir -p keys && cp ~/.config/solana/id.json keys/

# Set mint for the backend (required for mint/burn)
export MINT_ADDRESS=<your-stablecoin-mint-pubkey>

# Optional: send indexer events to backend compliance webhook (after compliance is deployed)
export WEBHOOK_URL=http://backend:3000/compliance/webhook

docker compose up --build
```

- **Backend** listens on port 3000. Health: `curl http://localhost:3000/health`. The backend runs an in-process event listener by default; set `RUN_EVENT_LISTENER=false` or `AUDIT_FROM_CHAIN=false` to disable.
- **Indexer** (optional) subscribes to the SSS program and POSTs raw program logs to `WEBHOOK_URL` (if set) with retry. No port exposed. Use when you want indexer-only (no API) or to forward raw logs elsewhere.

## Compliance / audit

The backend exposes a **compliance module** (blacklist management, sanctions screening integration point, transaction monitoring, audit trail export).

### Endpoints

- **POST /compliance/webhook**  
  Receives indexer payloads (e.g. set `WEBHOOK_URL=http://backend:3000/compliance/webhook`). Body: `{ type: "program_logs", programId, signature, logs, err }`. Responds 204. Events are stored for audit export.

- **GET /compliance/blacklist?mint=&lt;pubkey&gt;**  
  Returns `{ mint, entries: [{ address, reason?, addedAt }] }`. If `mint` is omitted, uses `MINT_ADDRESS`.

- **POST /compliance/blacklist**  
  Body: `{ mint?, address, reason? }`. Calls on-chain `add_to_blacklist` and records in audit. Requires keypair with blacklister role.

- **DELETE /compliance/blacklist/:address?mint=**  
  Removes address from blacklist on-chain and from local list. Requires blacklister role.

- **POST /compliance/screening**  
  Body: `{ address }`. Sanctions screening integration point. If `COMPLIANCE_SCREENING_URL` is set, forwards to that provider; otherwise returns stub `{ screened: true, match: false }`.

- **GET /compliance/audit-log?action=&from=&to=&mint=&format=json|csv**  
  Returns audit entries. `action`: one of `program_logs`, `blacklist_add`, `blacklist_remove`, `seize`, `mint`, `burn`, `freeze`, `thaw`, `pause`, `unpause`, `blocked`, `authority_transfer`, `minter_update`, `init`. `format=csv` returns CSV with columns timestamp, type, signature, mint, address, reason, actor, amount.

### Env

- `MINT_ADDRESS` — default mint for blacklist/audit when not specified in request.
- `API_KEY` — optional; when set, protected routes require `X-API-Key` header.
- `CORS_ORIGIN` — optional; allowed origin(s) for CORS (default `*`).
- `AUDIT_FROM_CHAIN` — optional; enable in-process event listener (default `true`).
- `RUN_EVENT_LISTENER` — optional; subscribe to program logs (default `true`).
- `COMPLIANCE_SCREENING_URL` — optional URL for sanctions screening provider (POST with `{ address }`).

Audit trail format and regulatory notes: see [COMPLIANCE.md](COMPLIANCE.md).

## Admin TUI

The repo includes an optional Admin TUI (`packages/tui`) that supports two modes:

- **Backend mode:** `BACKEND_URL` set — uses the backend API (keys on server, compliance, audit log).
- **Standalone mode:** `BACKEND_URL` unset — uses SDK/RPC directly (local keypair at `KEYPAIR_PATH`, no backend).

**Run:** From repo root, `pnpm run tui` (or `pnpm -C packages/tui run start` after `pnpm run build` in `packages/tui`).

- **Backend mode:** Set `BACKEND_URL` to the backend base URL (e.g. `http://localhost:3000`). If the backend has `API_KEY` set, set `API_KEY` in the TUI environment as well.
- **Standalone mode:** Set `RPC_URL` (default devnet) and `KEYPAIR_PATH` (default `~/.config/solana/id.json`). Mint, burn, freeze/thaw, pause, roles, blacklist, and seize use the local keypair. Audit log and blacklist list require backend.

**Usage:** Tab/arrow keys switch views; Enter submits forms.
