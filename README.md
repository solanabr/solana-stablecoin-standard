# Solana Stablecoin Standard (SSS)

A production-ready, open stablecoin standard built on [Token-2022](https://spl.solana.com/token-2022) and [Anchor](https://www.anchor-lang.com/). SSS provides three compliance presets for issuing regulated stablecoins on Solana — from minimal CBDCs to privacy-preserving regulated assets with oracle price feeds and on-chain blacklist enforcement.

## Overview

| Preset | Extensions | Use Case |
|--------|-----------|----------|
| **SSS-1** | MintCloseAuthority, MetadataPointer, FreezeAuthority | Minimal CBDC, DeFi stablecoin |
| **SSS-2** | SSS-1 + PermanentDelegate + TransferHook | Regulated stablecoin with compliance |
| **SSS-3** | SSS-2 + ConfidentialTransferMint | Privacy-preserving regulated stablecoin |

**Bonus Features:**
- **Oracle Integration** — Non-USD peg support via Pyth/Switchboard price feeds (EUR, GBP, XAU, BRL, etc.)
- **Interactive Terminal UI** — Real-time dashboard for monitoring and managing SSS tokens
- **SSS-3 Confidential Transfers** — Encrypted balances and transfer amounts with regulatory auditor key

SSS-2/SSS-3 enforce blacklist restrictions on **every token transfer** via a dedicated Transfer Hook program — no cooperation from wallets or apps required.

## Repository Structure

```
solana-stablecoin-standard/
├── programs/
│   ├── solana-stablecoin-standard/   # Main Anchor program (13 instructions)
│   └── sss-transfer-hook/            # Token-2022 transfer hook (SSS-2/3 blacklist)
├── sdk/                              # @stbr/sss-sdk TypeScript SDK
├── cli/                              # sss-token CLI tool (20+ commands)
├── tui/                              # Interactive terminal dashboard
├── backend/                          # REST API service
├── tests/                            # Integration tests (Anchor + TypeScript)
└── docs/                             # Full documentation (10 docs)
```

## Program IDs (Devnet)

| Program | Address |
|---------|---------|
| `solana-stablecoin-standard` | [`GMqW1Zi5DExSZT6CJEYHjhjmP6hUmu2tv9vrYaCgTPrE`](https://explorer.solana.com/address/GMqW1Zi5DExSZT6CJEYHjhjmP6hUmu2tv9vrYaCgTPrE?cluster=devnet) |
| `sss-transfer-hook` | [`Eyg11bpgnEySxHVypdi31S6J112dhadnTC2w8bDctK1z`](https://explorer.solana.com/address/Eyg11bpgnEySxHVypdi31S6J112dhadnTC2w8bDctK1z?cluster=devnet) |

> **Deployed 2026-03-02 UTC.** See [DEVNET_EVIDENCE.md](./DEVNET_EVIDENCE.md) for transaction proofs.

## Quick Start

### Prerequisites

- [Rust](https://rustup.rs/) 1.75+
- [Anchor CLI](https://www.anchor-lang.com/docs/installation) 0.32.1
- [Node.js](https://nodejs.org/) 20+ / [pnpm](https://pnpm.io/)
- [Solana CLI](https://docs.solanalabs.com/cli/install) 1.18+

### Build

```bash
# Build both programs
anchor build

# Build SDK
cd sdk && npm install && npm run build

# Build CLI
cd cli && npm install && npm run build && npm link
```

### Deploy (Devnet)

```bash
# Set to devnet
solana config set --url devnet

# Fund your keypair
solana airdrop 4

# Deploy programs
anchor deploy

# Initialize an SSS-1 stablecoin
sss-token init \
  --preset sss-1 \
  --name "My Stablecoin" \
  --symbol "MUSD" \
  --decimals 6 \
  --max-supply 1000000000000
```

### Configure Oracle (Non-USD Peg)

```bash
# Set up EUR peg with Pyth oracle
sss-token oracle set \
  --mint <your-mint> \
  --feed <pyth-eur-usd-feed> \
  --currency EUR \
  --staleness 60

# Check oracle status
sss-token oracle status --mint <your-mint>
```

### Launch Dashboard

```bash
# Interactive terminal UI
sss-token dashboard --mint <your-mint>
```

### Run Tests

```bash
# Start local validator and run integration tests
anchor test --provider.cluster localnet
```

### Run Backend Service

```bash
# With Docker Compose
SSS_MINT=<your-mint-address> docker-compose up

# Or directly
cd backend && npm install && npm run build
SSS_MINT=<your-mint-address> \
ANCHOR_PROVIDER_URL=https://api.devnet.solana.com \
ANCHOR_WALLET=~/.config/solana/id.json \
npm start
```

## Architecture

```
┌─────────────────────────────────────────────────────┐
│   sss-token CLI  ·  Terminal Dashboard (TUI)        │
│   @stbr/sss-sdk  ·  REST Backend                    │
├─────────────────────────────────────────────────────┤
│          solana-stablecoin-standard program          │
│  (init · mint · burn · freeze · blacklist · oracle) │
├──────────────────────┬──────────────────────────────┤
│  sss-transfer-hook   │      Token-2022 Program       │
│  (SSS-2/3 blacklist  │  (MintAuthority · Freeze ·   │
│   on every transfer) │   PermanentDelegate · Hook ·  │
│                      │   ConfidentialTransfer)        │
└──────────────────────┴──────────────────────────────┘
         │
  ┌──────▼──────────────────┐
  │  Oracle Price Feed       │
  │  (Pyth / Switchboard)    │
  │  Non-USD peg validation  │
  └─────────────────────────┘
```

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the full design.

## Role-Based Access Control

| Operation | master_authority | minter | burner | pauser | blacklister | seizer |
|-----------|:---:|:---:|:---:|:---:|:---:|:---:|
| initialize | owner | — | — | — | — | — |
| mint | ✓ | ✓ | — | — | — | — |
| burn | ✓ | — | ✓ | — | — | — |
| freeze/thaw | ✓ | — | — | ✓ | — | — |
| pause/unpause | ✓ | — | — | ✓ | — | — |
| blacklist add/remove | ✓ | — | — | — | ✓ | — |
| seize | ✓ | — | — | — | — | ✓ |
| configure_oracle | ✓ | — | — | — | — | — |
| update_roles | ✓ | — | — | — | — | — |

## SDK Usage

```typescript
import { SolanaStablecoin, StablecoinPreset } from '@stbr/sss-sdk';

// Create a new SSS-2 stablecoin
const stablecoin = await SolanaStablecoin.create(provider, {
  name: 'USD Coin',
  symbol: 'USDC',
  uri: 'https://example.com/usdc.json',
  decimals: 6,
  preset: StablecoinPreset.SSS2,
});

// Mint tokens
await stablecoin.mint(recipientAta, new BN(1_000_000)); // 1 USDC

// Configure EUR oracle
await stablecoin.oracle.configure({
  priceFeed: pythEurUsdFeed,
  pegCurrency: 'EUR',
  maxStalenessSecs: 60,
  priceExponent: -8,
});

// Add address to blacklist (SSS-2/3 only)
await stablecoin.compliance.blacklistAdd(suspiciousAddress, 1);
```

## Documentation

| Doc | Description |
|-----|-------------|
| [ARCHITECTURE.md](docs/ARCHITECTURE.md) | System design, PDA layout, component diagram |
| [SSS-1.md](docs/SSS-1.md) | SSS-1 preset guide with examples |
| [SSS-2.md](docs/SSS-2.md) | SSS-2 compliance features |
| [SSS-3.md](docs/SSS-3.md) | SSS-3 confidential transfers |
| [ORACLE.md](docs/ORACLE.md) | Oracle integration for non-USD pegs |
| [SDK.md](docs/SDK.md) | TypeScript SDK reference |
| [CLI.md](docs/CLI.md) | sss-token CLI reference |
| [API.md](docs/API.md) | REST backend API reference |
| [OPERATIONS.md](docs/OPERATIONS.md) | Deployment and operations guide |

## License

Apache 2.0
