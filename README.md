# Solana Stablecoin Standard (SSS)

A modular, open-source SDK for building production-ready stablecoins on Solana using Token-2022 extensions. Built as composable, opinionated presets that institutions and builders can fork, customize, and deploy.

> Think OpenZeppelin for Solana stablecoins — the library is the SDK, the standards (SSS-1, SSS-2) are the contracts.

## Architecture

```
Layer 3 — Standard Presets    ┌─────────┐  ┌─────────────────┐
                              │  SSS-1  │  │      SSS-2      │
                              │ Minimal │  │   Compliant     │
                              └────┬────┘  └────────┬────────┘
                                   │                │
Layer 2 — Modules             ┌────┴────────────────┴────────┐
                              │  Compliance │ Privacy │ ...   │
                              └────────────┬─────────────────┘
                                           │
Layer 1 — Base SDK            ┌────────────┴─────────────────┐
                              │  Token-2022 Mint + Freeze +   │
                              │  Metadata + Role Management   │
                              └───────────────────────────────┘
```

### Presets

| Standard | Name | Description |
|----------|------|-------------|
| **SSS-1** | Minimal Stablecoin | Mint authority + freeze authority + metadata. For simple stablecoins — internal tokens, DAO treasuries, ecosystem settlement. |
| **SSS-2** | Compliant Stablecoin | SSS-1 + permanent delegate + transfer hook + blacklist enforcement. For regulated stablecoins (USDC/USDT-class). |

## Devnet Deployment

Both programs are deployed and verified on Solana Devnet:

| Program | Program ID | Explorer |
|---------|-----------|----------|
| **sss_token** | `4G5DbG9WojH11bcpHQS4wvWKT7YDdnZzaYoGjLU9NYtF` | [View on Explorer](https://explorer.solana.com/address/4G5DbG9WojH11bcpHQS4wvWKT7YDdnZzaYoGjLU9NYtF?cluster=devnet) |
| **sss_transfer_hook** | `GCKas56DYv14WBEmbX6McYrKhpQijAkQ1Xa39mGEhdp4` | [View on Explorer](https://explorer.solana.com/address/GCKas56DYv14WBEmbX6McYrKhpQijAkQ1Xa39mGEhdp4?cluster=devnet) |

**Deploy transactions:**
- sss_token: [`2jCE58bpzRWzeBiCkUtURot9ba1jMPX7m4Jmj31vu4LihaZqSLmasKuU2zdijag5xAWGFu2MRN2kz9PcJc6c1AF9`](https://explorer.solana.com/tx/2jCE58bpzRWzeBiCkUtURot9ba1jMPX7m4Jmj31vu4LihaZqSLmasKuU2zdijag5xAWGFu2MRN2kz9PcJc6c1AF9?cluster=devnet)
- sss_transfer_hook: [`5e6EwFFSwUetvKJdXPmZi6fT6vvKgEchsfjUPtzCzauyfCTRn3D2GQwcVgJuqbdquNtJTNP5x8sb3y4JLj5nb8Qp`](https://explorer.solana.com/tx/5e6EwFFSwUetvKJdXPmZi6fT6vvKgEchsfjUPtzCzauyfCTRn3D2GQwcVgJuqbdquNtJTNP5x8sb3y4JLj5nb8Qp?cluster=devnet)

## Quick Start

### Prerequisites

- [Rust](https://rustup.rs/) 1.75+
- [Solana CLI](https://docs.solana.com/cli/install-solana-cli-tools) 1.18+
- [Anchor](https://www.anchor-lang.com/docs/installation) 0.31+
- [Node.js](https://nodejs.org/) 20+

### Build

```bash
# Clone the repo
git clone https://github.com/solanabr/solana-stablecoin-standard.git
cd solana-stablecoin-standard

# Install dependencies
yarn install

# Build Anchor programs
anchor build

# Build TypeScript SDK
yarn build
```

### Deploy to Devnet

```bash
solana config set --url devnet
anchor deploy --provider.cluster devnet
```

### CLI Usage

```bash
# Initialize SSS-1 (minimal)
sss-token init --preset sss-1 --name "My Stablecoin" --symbol "MUSD"

# Initialize SSS-2 (compliant)
sss-token init --preset sss-2 --name "Regulated USD" --symbol "RUSD"

# Operations
sss-token mint <recipient> <amount>
sss-token burn <amount>
sss-token freeze <token-account>
sss-token freeze <token-account> --thaw
sss-token pause / pause --unpause
sss-token status

# SSS-2 Compliance
sss-token blacklist add <address> --reason "OFAC match"
sss-token blacklist remove <address>
sss-token seize <token-account> --to <treasury>

# Management
sss-token minters add <address> --quota 1000000
sss-token minters remove <address>
sss-token roles grant <address> burner
sss-token roles revoke <address> burner
```

### TypeScript SDK

```typescript
import { SolanaStablecoin, Presets } from "@stbr/sss-token";

// Create SSS-2 compliant stablecoin
const stable = await SolanaStablecoin.create(connection, {
  preset: Presets.SSS_2,
  name: "My Stablecoin",
  symbol: "MYUSD",
  decimals: 6,
  authority: adminKeypair,
});

// Mint tokens
await stable.mint({ recipient, amount: 1_000_000, minter });

// SSS-2 compliance operations
await stable.compliance.blacklistAdd(address, "Sanctions match");
await stable.compliance.seize(frozenAccount, treasury);

// View state
const supply = await stable.getTotalSupply();
```

### Backend Services

```bash
# Start with Docker
cp backend/.env.example backend/.env
# Edit backend/.env with your settings
docker compose up
```

## Documentation

| Document | Description |
|----------|-------------|
| [ARCHITECTURE.md](docs/ARCHITECTURE.md) | Layer model, data flows, security model |
| [SDK.md](docs/SDK.md) | Presets, custom configs, TypeScript examples |
| [OPERATIONS.md](docs/OPERATIONS.md) | Operator runbook (mint, freeze, seize, etc.) |
| [SSS-1.md](docs/SSS-1.md) | Minimal stablecoin standard spec |
| [SSS-2.md](docs/SSS-2.md) | Compliant stablecoin standard spec |
| [COMPLIANCE.md](docs/COMPLIANCE.md) | Regulatory considerations, audit trail format |
| [API.md](docs/API.md) | Backend API reference |

## Role-Based Access Control

| Role | SSS-1 | SSS-2 | Capabilities |
|------|-------|-------|-------------|
| Master Authority | ✓ | ✓ | Manages all roles, transfers authority |
| Minter | ✓ | ✓ | Mints tokens (with per-minter quotas) |
| Burner | ✓ | ✓ | Burns tokens from own account |
| Pauser | ✓ | ✓ | Pauses/unpauses all operations |
| Freezer | ✓ | ✓ | Freezes/thaws token accounts |
| Blacklister | — | ✓ | Manages the on-chain blacklist |
| Seizer | — | ✓ | Seizes tokens via permanent delegate |

## Testing

```bash
# Run all tests
anchor test

# Run specific test file
anchor test -- tests/sss-1.ts
anchor test -- tests/sss-2.ts

# Run SDK tests
yarn test:sdk
```

## Project Structure

```
├── programs/
│   ├── sss-token/          # Core stablecoin program (Anchor)
│   └── sss-transfer-hook/  # Transfer hook for blacklist enforcement
├── sdk/
│   └── core/               # TypeScript SDK + CLI
├── backend/                # Backend services (Express + Docker)
├── tests/                  # Integration tests
├── docs/                   # Documentation
└── docker-compose.yml      # Backend deployment
```

## License

MIT — see [LICENSE](LICENSE) for details.

## References

- [Solana Vault Standard](https://github.com/solanabr/solana-vault-standard)
- [Token-2022 Extensions](https://spl.solana.com/token-2022)
- [Anchor Framework](https://www.anchor-lang.com/)
- [GENIUS Act Compliance](https://www.congress.gov/bill/118th-congress/senate-bill/4155)
