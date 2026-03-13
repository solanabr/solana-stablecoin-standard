# Solana Stablecoin Standard (SSS)

A modular SDK with standardized presets for building stablecoins on Solana. Think OpenZeppelin for stablecoins — the SDK is the library, the standards (SSS-1, SSS-2, SSS-3) are what gets adopted.

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
  supplyCap: BigInt(1_000_000_000_000), // Optional: 1M token hard cap
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

# Deploy & manage
sss-token init --preset sss-2 --name "MYUSD" --symbol "MYUSD" --decimals 6
sss-token mint <recipient> <amount>
sss-token blacklist add <address> --reason "OFAC match"
sss-token seize <address> --to <treasury>
sss-token status

# Pre-deployment validation
sss-token validate --preset sss-2 --name "MYUSD" --symbol "MYUSD" --supply-cap 1000000000

# Compliance audit trail
sss-token audit-log --mint <address> --action mint --format json
sss-token audit-log --mint <address> --format table --limit 100
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
| **Supply Cap** | ✅ | ✅ | ✅ |
| Permanent Delegate | ❌ | ✅ | ✅ |
| Transfer Hook | ❌ | ✅ | ✅ |
| Blacklist/Seize | ❌ | ✅ | ✅ |
| Confidential Transfers | ❌ | ❌ | ✅ |
| **Use Case** | DAO treasuries | USDC/USDT-class | Privacy (institutional) |

## Features

- **Single configurable program** — one Anchor program, multiple presets via init params
- **Role-based access control** — master authority, minters (per-minter quotas), burners, pauser, blacklister, seizer
- **Config PDA as mint authority** — no external key can mint directly
- **Supply cap enforcement** — optional hard cap prevents over-minting (regulatory safety)
- **Asymmetric pause** — pauser can stop, only admin can restart
- **SSS-2 compliance** — on-chain blacklist enforcement, permanent delegate for seizure
- **SSS-3 privacy** — confidential transfers with ZK proofs (E2E verified)
- **Oracle module** — price feeds for non-USD pegs via Switchboard
- **CLI tools** — `validate` (pre-deployment checks), `audit-log` (compliance trail)
- **51 integration tests + 13-check CT E2E script** — across 5 test suites

## Repository Structure

```
solana-stablecoin-standard/
├── programs/
│   ├── sss-token/          # Main stablecoin program (Anchor)
│   └── oracle-module/      # Oracle price feeds (Switchboard)
├── sdk/                    # @stbr/sss-token TypeScript SDK
├── cli/                    # sss-token CLI (init, mint, audit-log, validate)
├── tests/                  # Integration tests (51 tests)
│   ├── sss-1.test.ts       # SSS-1 tests (24)
│   ├── sss-2.test.ts       # SSS-2 tests (14)
│   ├── sss-3.test.ts       # SSS-3 tests (6)
│   └── oracle.test.ts      # Oracle tests (8) [inc. 1 skipped: devnet]
├── scripts/
│   └── test-ct-e2e.sh      # Confidential Transfer E2E (13 checks)
├── docs/                   # Documentation
└── AUDIT.md                # Test coverage audit
```

## Documentation

| Document | Description |
|----------|-------------|
| [SSS-1](docs/SSS-1.md) | Minimal stablecoin standard spec |
| [SSS-2](docs/SSS-2.md) | Compliant stablecoin standard spec |
| [SSS-3](docs/SSS-3.md) | Private stablecoin — CT architecture + E2E guide |
| [Architecture](docs/ARCHITECTURE.md) | Layer model, data flows, security |
| [SDK Reference](docs/SDK.md) | Presets, custom configs, TypeScript examples |
| [Operations](docs/OPERATIONS.md) | Operator runbook (mint, freeze, seize, etc.) |
| [API Reference](docs/API.md) | Program instructions, account layouts, events |
| [Compliance](docs/COMPLIANCE.md) | Regulatory guide, audit trail, sanctions |
| [Oracle](docs/ORACLE.md) | Oracle integration for non-USD pegs |
| [Deploy](docs/DEPLOY.md) | Step-by-step devnet deployment guide |
| [Examples](examples/README.md) | Usage scripts for SSS-1, SSS-2, SSS-3 |

## Testing

```bash
# Run all 51 integration tests
anchor test

# Run SSS-3 Confidential Transfer E2E (localnet)
bash scripts/test-ct-e2e.sh

# Tests cover:
# - SSS-1: init, mint, burn, freeze/thaw, pause, roles, authority, supply cap
# - SSS-2: blacklist add/remove, seize flow, feature gating, unauthorized access
# - SSS-3: CT init, extension coexistence, mint on CT, supply tracking
# - Oracle: config, feed updates, price queries, adjusted minting
# - CT E2E: configure, deposit, apply, confidential transfer (ZK proofs), withdraw
```

### Pre-Deployment Validation

```bash
# Validate config before deploying
sss-token validate --preset sss-2 --name "BRL Stablecoin" --symbol "BRLC" --supply-cap 10000000000000
```

### Compliance Audit Trail

```bash
# View on-chain audit log for a stablecoin
sss-token audit-log --mint <MINT_ADDRESS> --format table
sss-token audit-log --mint <MINT_ADDRESS> --action mint --format json
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
