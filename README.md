# Solana Stablecoin Standard (SSS)

A modular framework for issuing compliant stablecoins on Solana using Token-2022 and Token ACL (sRFC37).

## Key Differentiators

- **No Transfer Hooks** — Zero overhead on transfers, full DEX compatibility
- **No Permanent Delegate** — Eliminates vault drain risk
- **Permissionless Freeze/Thaw** — Via Token ACL, minimizing key exposure
- **Preset-Based** — SSS-1 (minimal) or SSS-2 (compliant) configurations

## Presets

| Feature | SSS-1 (Minimal) | SSS-2 (Compliant) |
|---------|-----------------|-------------------|
| Token-2022 Mint | Yes | Yes |
| On-chain Metadata | Yes | Yes |
| Role-based Access | Yes | Yes |
| Pause/Unpause | Yes | Yes |
| DefaultAccountState(Frozen) | No | Yes |
| Token ACL Integration | No | Yes |
| Allowlist/Blocklist | No | Yes |
| Permissionless Freeze/Thaw | No | Yes |

## Quick Start

### Prerequisites

- Solana CLI v2.1+
- Anchor CLI v0.32.1
- Node.js v20+
- Rust 1.85+

### Build

```bash
# Install dependencies
yarn install

# Build on-chain programs
anchor build

# Build SDK
yarn build:sdk
```

### Test

```bash
anchor test
```

### Create a Stablecoin

```bash
# SSS-1 (minimal)
sss-token create --name "My Dollar" --symbol MUSD --decimals 6 --preset sss-1

# SSS-2 (compliant with transfer hook)
sss-token create --name "Compliant Dollar" --symbol CUSD --decimals 6 \
  --preset sss-2 --transfer-hook-program <HOOK_PROGRAM_ID> --treasury <TREASURY_PUBKEY>
```

## Architecture

```
sss-core (Anchor)           — Mint creation, minting, burning, roles, pause
sss-transfer-hook (Anchor)  — Transfer hook with blacklist enforcement
SDK (@sss/sdk)         — TypeScript client library
CLI (@sss/cli)         — Command-line tool (sss-token)
Backend (@sss/backend) — REST API + indexer + webhooks
```

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for detailed architecture documentation.

## Programs

| Program | Description | ID |
|---------|-------------|-----|
| sss-core | Core stablecoin operations | `FH3XosNdAdUPfcxVxjUrUoCrGaLw9L3i9eadu7M8nQZQ` |
| sss-transfer-hook | Transfer hook with blacklist | `Hook1111111111111111111111111111111111111111` |

## Documentation

- [Architecture](docs/ARCHITECTURE.md)
- [SDK Reference](docs/SDK.md)
- [SSS-1 Spec](docs/SSS-1.md)
- [SSS-2 Spec](docs/SSS-2.md)
- [Compliance Guide](docs/COMPLIANCE.md)
- [Operations Guide](docs/OPERATIONS.md)
- [API Reference](docs/API.md)

## License

MIT
