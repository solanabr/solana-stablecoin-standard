# SSS CLI + Backend API

CLI tooling and REST API backend for the Solana Stablecoin Standard. This is a companion to the [Core Programs + SDK PR](#).

## CLI (`cli/`)

Rust-based CLI (`sss-token`) for managing SSS stablecoins from the terminal.

### Commands

| Command | Description |
|---------|-------------|
| `init` | Initialize a new stablecoin (SSS-1/2/3) |
| `mint` / `burn` | Mint and burn tokens |
| `freeze` / `thaw` | Freeze and unfreeze accounts |
| `pause` / `unpause` | Emergency stop/resume |
| `blacklist` | Add/remove from blacklist |
| `allowlist` | Add/remove from allowlist |
| `seize` | Seize tokens from frozen account |
| `update-roles` | Manage role assignments |
| `update-minter` | Enable/disable minters, set quotas |
| `transfer-authority` | Transfer master authority |
| `nominate-authority` / `accept-authority` | Two-step authority transfer |
| `set-supply-cap` | Set maximum supply |
| `update-metadata` | Update token metadata |
| `attest` | Record reserve attestation |
| `status` / `info` / `supply` | Query stablecoin state |
| `holders` / `minters` / `roles` | List accounts and roles |
| `audit-log` | Query on-chain audit trail |

### Usage

```bash
cargo install --path cli

sss-token init --preset sss-2 --name "USD Stablecoin" --symbol USDS --decimals 6
sss-token mint --amount 1000000 --recipient <ADDRESS>
sss-token blacklist --add <ADDRESS> --reason "OFAC SDN"
sss-token status
```

## Backend API (`backend/`)

Express.js REST API wrapping the TypeScript SDK for server-side stablecoin management.

### Endpoints

- `GET /health` — Health check
- `GET /api/stablecoin/:mint` — Fetch config + roles
- `GET /api/stablecoin/:mint/minter/:address` — Minter info
- `GET /api/stablecoin/:mint/blacklist/:address` — Blacklist status
- `GET /api/stablecoin/:mint/allowlist/:address` — Allowlist status
- `POST /api/stablecoin/:mint/mint` — Mint tokens
- `POST /api/stablecoin/:mint/burn` — Burn tokens
- `POST /api/stablecoin/:mint/freeze` — Freeze account
- `POST /api/stablecoin/:mint/blacklist` — Add to blacklist

### Features

- API key authentication
- Rate limiting on POST endpoints
- Compliance screening service (pluggable providers)
- Webhook notifications for on-chain events
- Structured error handling

### Setup

```bash
cd backend
npm install
cp .env.example .env  # Set API_KEY, RPC_URL
npm start             # Runs on port 3001
```

## Tests

- `tests/cli/` — CLI command regression tests (7 tests)
- `tests/dashboard-api/` — Backend API endpoint tests (17 tests)
- `tests/docker/` — Docker integration test (1 test)
