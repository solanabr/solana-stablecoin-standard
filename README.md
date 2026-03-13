# Solana Stablecoin Standard (SSS)

A modular SDK with standardized presets for building stablecoins on Solana. Think OpenZeppelin for stablecoins — the SDK is the library, the standards (SSS-1, SSS-2) are what gets adopted.

## Quick Start

### SDK

```bash
npm install @stbr/sss-token
```

```typescript
import { SolanaStablecoin, Presets } from "@stbr/sss-token";

// SSS-2: Compliant stablecoin (permanent delegate + blacklist)
const stable = await SolanaStablecoin.create(connection, wallet, {
  preset: Presets.SSS_2,
  name: "My Stablecoin",
  symbol: "MYUSD",
  decimals: 6,
});

// Mint
await stable.mint({ recipient: userPubkey, amount: BigInt(1_000_000) });

// Compliance (SSS-2)
await stable.compliance.blacklistAdd(address, "Sanctions match");
await stable.compliance.seize(frozenAccount, treasury);

// Query
const supply = await stable.getTotalSupply();
```

### CLI

```bash
npm install -g @stbr/sss-cli

sss-token init --preset sss-2 --name "MYUSD" --symbol "MYUSD" --decimals 6
sss-token mint <recipient> <amount>
sss-token blacklist add <address> --reason "OFAC match"
sss-token seize <address> --to <treasury>
sss-token status
```

## Architecture

Three-layer design following the OpenZeppelin pattern:

```
┌────────────────────────────────────────────────────────────┐
│              Layer 3: Standard Presets                      │
│   SSS-1 (Minimal)   SSS-2 (Compliant)   SSS-3 (Private)   │
├────────────────────────────────────────────────────────────┤
│              Layer 2: Modules                               │
│   Compliance        Privacy           Oracle                │
│   (Blacklist,       (Confidential     (Price Feeds,         │
│    Perm. Delegate,   Transfers)        Non-USD Pegs)        │
│    Transfer Hook)                                           │
├────────────────────────────────────────────────────────────┤
│              Layer 1: Base SDK                              │
│   Token-2022 Mint   Role Management   Config PDA            │
└────────────────────────────────────────────────────────────┘
```

## Preset Comparison

| Feature | SSS-1 (Minimal) | SSS-2 (Compliant) | SSS-3 (Private) |
|---------|:---:|:---:|:---:|
| Mint/Burn with quotas | ✅ | ✅ | ✅ |
| Freeze/Thaw | ✅ | ✅ | ✅ |
| Pause/Unpause | ✅ | ✅ | ✅ |
| Role-based access | ✅ | ✅ | ✅ |
| Permanent Delegate | ❌ | ✅ | ❌ |
| Transfer Hook | ❌ | ✅ | ❌ |
| Blacklist/Seize | ❌ | ✅ | ❌ |
| Confidential Transfers | ❌ | ❌ | ✅ |
| **Use Case** | DAO treasuries | USDC/USDT-class | Privacy (experimental) |

## Features

- **Single configurable program** — one Anchor program, multiple presets via init params
- **Role-based access control** — master authority, minters (per-minter quotas), burners, pauser, blacklister, seizer
- **Config PDA as mint authority** — no external key can mint directly
- **Asymmetric pause** — pauser can stop, only admin can restart
- **SSS-2 compliance** — on-chain blacklist enforcement, permanent delegate for seizure
- **SSS-3 privacy** — confidential transfers (experimental)
- **Oracle module** — price feeds for non-USD pegs (bonus)
- **25 integration tests** — across 4 test suites

## Repository Structure

```
solana-stablecoin-standard/
├── programs/
│   ├── sss-token/          # Main stablecoin program (Anchor)
│   └── oracle-module/      # Oracle price feeds (bonus)
├── sdk/                    # @stbr/sss-token TypeScript SDK
├── cli/                    # sss-token CLI
├── tests/                  # Integration tests (25 tests)
│   ├── sss-1.test.ts       # SSS-1 tests (10)
│   ├── sss-2.test.ts       # SSS-2 tests (8)
│   ├── sss-3.test.ts       # SSS-3 tests (3)
│   └── oracle.test.ts      # Oracle tests (4)
└── docs/                   # Documentation
```

## Documentation

| Document | Description |
|----------|-------------|
| [SSS-1](docs/SSS-1.md) | Minimal stablecoin standard spec |
| [SSS-2](docs/SSS-2.md) | Compliant stablecoin standard spec |
| [SSS-3](docs/SSS-3.md) | Private stablecoin (experimental) |
| [Architecture](docs/ARCHITECTURE.md) | Layer model, data flows, security |
| [SDK Reference](docs/SDK.md) | Presets, custom configs, TypeScript examples |
| [Operations](docs/OPERATIONS.md) | Operator runbook (mint, freeze, seize, etc.) |
| [API Reference](docs/API.md) | Program instructions, account layouts, events |
| [Compliance](docs/COMPLIANCE.md) | Regulatory guide, audit trail, sanctions |
| [Oracle](docs/ORACLE.md) | Oracle integration for non-USD pegs |

## Testing

```bash
# Run all 25 tests
anchor test

# Tests cover:
# - SSS-1: init, mint, burn, freeze/thaw, pause, minter management, authority transfer
# - SSS-2: blacklist add/remove, seize flow, feature gating, unauthorized access
# - SSS-3: confidential transfer config, deposit/transfer/withdraw
# - Oracle: config, feed updates, price queries, adjusted minting
```

## Development

```bash
# Install dependencies
pnpm install

# Build programs
anchor build

# Run tests
anchor test

# Build SDK
cd sdk && pnpm build
```

## License

MIT
