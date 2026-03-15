# Solana Stablecoin Standard (SSS)

A modular, production-grade SDK for deploying and managing stablecoins on Solana using Token-2022.

## Overview

The Solana Stablecoin Standard provides a three-layer architecture for building stablecoins with varying levels of functionality:

| Preset | Description | Features |
|--------|-------------|----------|
| **SSS-1** | Minimal Stablecoin | Mint/freeze authority, metadata, role management, pause/unpause |
| **SSS-2** | Compliant Stablecoin | SSS-1 + permanent delegate, transfer hook blacklist, asset seizure |
| **SSS-3** | Private Stablecoin *(experimental)* | SSS-2 + confidential transfers, scoped allowlists |

## Quick Start

### Prerequisites

- Solana CLI ≥ 1.18
- Anchor ≥ 0.30.1
- Node.js ≥ 18
- Rust ≥ 1.75

### Installation

```bash
# Clone the repo
git clone https://github.com/solanabr/solana-stablecoin-standard.git
cd solana-stablecoin-standard

# Build the on-chain programs
anchor build

# Install SDK dependencies
cd sdk && npm install && npm run build && cd ..

# Install CLI
cd cli && npm install && npm link && cd ..
```

### Deploy an SSS-1 Stablecoin

**Using the CLI:**
```bash
sss-token init --preset sss-1 --name "USD Stablecoin" --symbol "USDS" --decimals 6
```

**Using the TypeScript SDK:**
```typescript
import { SolanaStablecoin, Presets } from "@solana-stablecoin/sdk";

const stable = await SolanaStablecoin.create(provider, {
  preset: Presets.SSS_1,
  name: "USD Stablecoin",
  symbol: "USDS",
  uri: "https://example.com/metadata.json",
  decimals: 6,
});

// Mint 1,000 tokens (6 decimals)
await stable.mint(destinationATA, 1_000_000_000n);
```

### Deploy an SSS-2 Compliant Stablecoin

```typescript
const compliant = await SolanaStablecoin.create(provider, {
  preset: Presets.SSS_2,
  name: "Compliant USD",
  symbol: "cUSD",
  uri: "https://example.com/metadata.json",
  decimals: 6,
});

// Compliance operations
await compliant.compliance.addToBlacklist(suspiciousAddress);
await compliant.compliance.seize(sourceATA, treasuryATA, amount, blacklistedWallet);
```

## Architecture

```
┌──────────────────────────────────────────┐
│  Layer 3: Standard Presets               │
│  SSS-1 (Minimal) │ SSS-2 (Compliant)    │
├──────────────────────────────────────────┤
│  Layer 2: Composable Modules             │
│  Compliance │ Transfer Hook │ Roles      │
├──────────────────────────────────────────┤
│  Layer 1: Base SDK                       │
│  Token-2022 │ Anchor Program │ Config    │
└──────────────────────────────────────────┘
```

See [ARCHITECTURE.md](docs/ARCHITECTURE.md) for detailed technical documentation.

## Project Structure

```
solana-stablecoin-standard/
├── programs/
│   ├── stablecoin/          # Main Anchor program
│   └── transfer-hook/       # Transfer hook for blacklist enforcement
├── sdk/                     # TypeScript SDK
├── cli/                     # CLI tool (sss-token)
├── services/                # Backend microservices
├── tests/                   # Unit, integration, and fuzz tests
├── docs/                    # Documentation
└── scripts/                 # Deployment and utility scripts
```

## Testing

```bash
# Run full integration test suite (SSS-1, SSS-2, presets, roles, seize flow)
anchor test

# Run specific test section
anchor test -- --grep "SSS-2"
anchor test -- --grep "Seize"
anchor test -- --grep "Preset"
```

Test coverage:
- **SSS-1**: Initialize, mint, burn, freeze/thaw, pause/unpause, role management, quota enforcement, authorization checks
- **SSS-2**: Initialize with compliance, blacklist add/remove, seize flow (mint→blacklist→seize→verify), seize security checks (wrong owner, wrong role), role separation
- **Presets**: SSS-1 features, SSS-2 features, custom features, validation (name/symbol/decimals)
- **Fuzz stubs**: Trident fuzz test templates in `tests/fuzz/`

## Documentation

- [Architecture](docs/ARCHITECTURE.md) - System design and account structure
- [SDK Reference](docs/SDK.md) - TypeScript SDK API documentation
- [Operations Guide](docs/OPERATIONS.md) - Day-to-day operational procedures
- [SSS-1 Specification](docs/SSS-1.md) - Minimal stablecoin standard
- [SSS-2 Specification](docs/SSS-2.md) - Compliant stablecoin standard
- [Compliance Guide](docs/COMPLIANCE.md) - Blacklist and seizure procedures
- [API Reference](docs/API.md) - On-chain program instruction reference

## Devnet Deployment

Program IDs (pre-deployment — will be updated by `scripts/deploy.sh`):
- Stablecoin Program: `8TthCsErsM5Q7yhfYKQ7USSnpFJhsw8MiBvEaqK7D3up`
- Transfer Hook: `3QdRLCZJ7DKGB1qC45YFzaVo9MijEYW2RrYbeRGpLqqy`

To deploy to devnet:

```bash
./scripts/deploy.sh devnet
```

The deploy script will:
1. Build programs
2. Extract and update program IDs in all source files
3. Rebuild with updated IDs
4. Deploy to the specified cluster

## Backend Services

Start all services with Docker:

```bash
cp config/.env.example config/.env
# Edit config/.env with your settings
docker compose up -d
```

Services:
| Service | Port | Description |
|---------|------|-------------|
| mint-burn | 3001 | Mint/burn request queue with SDK integration |
| indexer | 3002 | On-chain event listener and indexer |
| compliance | 3003 | Blacklist screening and audit trail (SSS-2) |
| webhook | 3004 | Webhook delivery with retry logic |

## Security

- All state-changing operations are gated behind role-based access control
- Mint and freeze authorities are held by PDAs, not individual wallets
- Transfer hook enforces blacklist checks at the protocol level
- Pause mechanism halts all token operations globally

## License

MIT
