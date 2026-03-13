# Solana Stablecoin Standard (SSS)

A modular SDK for institutional-grade stablecoins on Solana using Token-2022.

## Architecture

SSS now exposes a single on-chain program surface (`sss-1`) with optional modules:
- Core stablecoin controls (roles, mint/burn, freeze, metadata, pause, admin transfer, seizure)
- Optional compliance hook module (hook config, blacklist, compliance mode, hook authority transfer, transfer hook execution)

## Program

| Program | Description | Program ID |
|---------|------------|------------|
| `sss-1` | Core + optional compliance hook module | `J4Z8HDQs2VbmSxs1VURkGY5M51SDmiY8K5a1RVuTN6np` |

## Quick Start

```bash
# Build
anchor build

# Test (requires solana-test-validator installed)
anchor test --provider.cluster localnet

# Deploy to devnet
anchor deploy --provider.cluster devnet
```

## SDK

```typescript
import { SSSStablecoin, RoleType } from "@stbr/sss-token";

const stablecoin = new SSSStablecoin(program);

const { mint } = await stablecoin.initialize(
  {
    name: "USD Stablecoin",
    symbol: "USDS",
    uri: "https://example.com/metadata.json",
    decimals: 6,
    rolesEnabled: true,
    freezeEnabled: true,
  },
  admin
);

await stablecoin.initializeHookModule(mint.publicKey, admin);
```

## Features

- **Token-2022**: MetadataPointer, TokenMetadata, TransferHook, FreezeAuthority
- **Role Management**: Admin, Minter, Burner, Freezer, Blacklister
- **Optional Compliance Module**: Blacklist enforcement via transfer-hook instructions in `sss-1`
- **Backend Services**: Docker-ready mint/burn API, event indexer, compliance checker

## Project Structure

```
├── programs/
│   └── sss-1/              # Single on-chain program
├── sdk/core/               # TypeScript SDK (@stbr/sss-token)
├── cli/                    # Admin CLI (sss-token)
├── tests/                  # Integration tests
├── services/
│   ├── mint-burn/          # Mint/Burn API service
│   ├── indexer/            # Event indexer service
│   └── compliance/         # Compliance checking service
└── docs/                   # Documentation
```

## Documentation

- [Architecture](docs/ARCHITECTURE.md)
- [SSS-1 Spec](docs/SSS-1.md)
- [SSS-2 Spec](docs/SSS-2.md)
- [SDK Guide](docs/SDK.md)
- [API Reference](docs/API.md)
- [Security](docs/SECURITY.md)
- [Testing](docs/TESTING.md)
- [Deployment](docs/DEPLOYMENT.md)
- [Operations Runbook](docs/OPERATIONS.md)
- [Compliance](docs/COMPLIANCE.md)
- [Privacy](docs/PRIVACY.md)
- [CLI](docs/CLI.md)

## License

MIT
