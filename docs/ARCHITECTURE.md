# Solana Stablecoin Standard (SSS)

> Open-source SDK and production-ready standards for stablecoin issuers on Solana.

Built by [Superteam Brazil](https://superteam.fun/). Inspired by [OpenZeppelin](https://github.com/OpenZeppelin/openzeppelin-contracts) — the SDK is the library, the standards (SSS-1, SSS-2) are what get adopted.

---

## Overview

The SSS is a three-layer system:

```
Layer 3 — Standard Presets   SSS-1 (Minimal)   SSS-2 (Compliant)
Layer 2 — Modules            Compliance module  Privacy module (future)
Layer 1 — Base SDK           Token creation, roles, mint/burn/freeze
```

Think of it like OpenZeppelin: you pick a standard (SSS-1 or SSS-2), the SDK deploys it, and your team operates it via CLI or TypeScript.

---

## Quick Start

### Prerequisites

- Rust + Cargo
- Solana CLI >= 1.18
- Anchor >= 0.30.1
- Node.js >= 20

### Install

```bash
git clone https://github.com/solanabr/solana-stablecoin-standard
cd solana-stablecoin-standard
npm install
anchor build
```

### Deploy a Minimal Stablecoin (SSS-1)

```bash
# Initialize with SSS-1 preset
sss-token init --preset sss-1 --name "My Stablecoin" --symbol "MYUSD" --decimals 6

# Add a minter
sss-token minters add <MINTER_ADDRESS>

# Mint tokens
sss-token mint <RECIPIENT_ADDRESS> 1000000

# Check status
sss-token status
```

### Deploy a Compliant Stablecoin (SSS-2)

```bash
# Initialize with SSS-2 preset (adds permanent delegate + transfer hook)
sss-token init --preset sss-2 --name "Regulated USD" --symbol "RUSD" --decimals 6

# SSS-2 compliance operations
sss-token blacklist add <ADDRESS> --reason "OFAC match"
sss-token seize <ADDRESS> --to <TREASURY_ADDRESS>
```

### Custom Configuration

```toml
# config.toml
name = "My Custom Token"
symbol = "CUST"
decimals = 6
permanent_delegate = true
transfer_hook = false
default_account_frozen = false
```

```bash
sss-token init --custom config.toml
```

### TypeScript SDK

```typescript
import { SolanaStablecoin, Preset } from "@stbr/sss-token";

// SSS-1
const stable = await SolanaStablecoin.create({
  connection,
  preset: Preset.SSS_1,
  name: "My Stablecoin",
  symbol: "MYUSD",
  decimals: 6,
  authority: adminKeypair,
});

// SSS-2
const compliant = await SolanaStablecoin.create({
  connection,
  preset: Preset.SSS_2,
  name: "Regulated USD",
  symbol: "RUSD",
  decimals: 6,
  authority: adminKeypair,
});

// Operations
await stable.mint({ recipient, amount: 1_000_000n, minter });
await compliant.compliance.blacklistAdd(address, "Sanctions match");
await compliant.compliance.seize(frozenAccount, treasury);
const supply = await stable.getTotalSupply();
```

---

## Preset Comparison

| Feature | SSS-1 Minimal | SSS-2 Compliant |
|---|---|---|
| Token-2022 Mint | ✓ | ✓ |
| Metadata | ✓ | ✓ |
| Freeze Authority | ✓ | ✓ |
| Role Management | ✓ | ✓ |
| Pause/Unpause | ✓ | ✓ |
| Per-Minter Quotas | ✓ | ✓ |
| Permanent Delegate | — | ✓ |
| Transfer Hook | — | ✓ |
| Blacklist Enforcement | — | ✓ |
| Token Seizure | — | ✓ |
| Audit Trail | — | ✓ |
| Use Case | Internal tokens, DAO treasuries | USDC/USDT-class regulated tokens |

---

## Architecture

See [ARCHITECTURE.md](./docs/ARCHITECTURE.md) for the full layer model and data flows.

---

## Documentation

- [ARCHITECTURE.md](./docs/ARCHITECTURE.md) — Layer model, PDA layout, security model
- [SDK.md](./docs/SDK.md) — TypeScript SDK reference
- [OPERATIONS.md](./docs/OPERATIONS.md) — Operator runbook
- [SSS-1.md](./docs/SSS-1.md) — Minimal stablecoin standard spec
- [SSS-2.md](./docs/SSS-2.md) — Compliant stablecoin standard spec
- [COMPLIANCE.md](./docs/COMPLIANCE.md) — Regulatory considerations
- [API.md](./docs/API.md) — Backend service API reference

---

## Repository Structure

```
solana-stablecoin-standard/
├── programs/
│   ├── sss-token/          # Main Anchor program (SSS-1 + SSS-2)
│   └── transfer-hook/      # SSS-2 transfer hook program
├── sdk/                    # @stbr/sss-token TypeScript SDK
├── cli/                    # sss-token CLI
├── services/
│   ├── mint-burn/          # Fiat-to-stablecoin lifecycle service
│   ├── event-listener/     # On-chain event indexer
│   ├── compliance/         # SSS-2 compliance service
│   └── webhook/            # Event notification service
├── tests/
│   ├── unit/               # SDK unit tests
│   └── integration/        # Full preset flow tests
└── docs/                   # All documentation
```

---

## Running Backend Services

```bash
# Copy and configure
cp .env.example .env
# Edit .env: set RPC_URL, SSS_MINT, KEYPAIR_PATH

# Start all services
docker compose up -d

# View logs
docker compose logs -f

# Health checks
curl http://localhost:3001/health   # mint-burn
curl http://localhost:3002/health   # event-listener
curl http://localhost:3003/health   # compliance (SSS-2)
curl http://localhost:3004/health   # webhook
```

---

## License

MIT — see [LICENSE](./LICENSE).

Built with ❤️ by Superteam Brazil.