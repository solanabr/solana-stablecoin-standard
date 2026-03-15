# SSS Issuer Dashboard + Frontend

Frontend interface for the Solana Stablecoin Standard. This is the UI companion to the [Core Programs + SDK PR](#).

> **Review the core implementation first.** This PR provides the issuer-facing dashboard built on top of the on-chain programs and TypeScript SDK defined in the core PR.

## Dashboard (`app/`)

Next.js 16 application with Solana wallet integration for managing SSS stablecoins.

### Features

- **Supply Operations** — Mint and burn tokens with quota tracking
- **Account Management** — Freeze/thaw accounts, view holders
- **Compliance** — Blacklist/allowlist management with reason tracking
- **Audit Ledger** — On-chain audit trail viewer
- **Role Management** — Assign and revoke operational roles
- **Authority Transfer** — Two-step authority transfer flow
- **Reserve Attestation** — Record and view reserve proofs

### Stack

- Next.js 16 + React 19
- Tailwind CSS 4
- Solana Wallet Adapter (Phantom, Solflare, etc.)
- `@coral-xyz/anchor` for program interaction
- `solana-stablecoin-standard` SDK (local package)

### Setup

```bash
cd app
npm install
npm run dev  # http://localhost:3000
```

## TUI (`tui/`)

Terminal-based admin interface using Blessed for SSH-accessible management.

## Documentation Site (`docs-site/`)

Docusaurus documentation covering architecture, SDK reference, operations guide, and compliance docs.

## Tests

- `app/tests/` — Frontend E2E tests
- `tests/tui/` — TUI action tests (63 tests)
