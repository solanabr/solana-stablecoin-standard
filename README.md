# Solana Stablecoin Standard (SSS)

A modular SDK with standardized presets for building stablecoins on Solana.

## Quick Start

> 🚧 Under active development — quick start guide coming soon.

## Architecture

Three-layer design following the OpenZeppelin pattern:

- **Layer 1 — Base SDK**: Token creation, mint/freeze authority, metadata, role management
- **Layer 2 — Modules**: Composable compliance (blacklist, transfer hook) and privacy modules
- **Layer 3 — Standard Presets**: Opinionated combinations (SSS-1, SSS-2, SSS-3)

## Preset Comparison

| Feature | SSS-1 (Minimal) | SSS-2 (Compliant) | SSS-3 (Private) |
|---------|-----------------|-------------------|-----------------|
| Mint/Burn | ✅ | ✅ | ✅ |
| Freeze/Thaw | ✅ | ✅ | ✅ |
| Metadata | ✅ | ✅ | ✅ |
| Role Management | ✅ | ✅ | ✅ |
| Permanent Delegate | ❌ | ✅ | ❌ |
| Transfer Hook | ❌ | ✅ | ❌ |
| Blacklist | ❌ | ✅ | ❌ |
| Default Frozen | ❌ | ✅ | ❌ |
| Confidential Transfers | ❌ | ❌ | ✅ |
| Use Case | DAO treasuries, simple stables | USDC/USDT-class regulated tokens | Privacy-preserving (experimental) |

## Repository Structure

```
programs/          → Anchor programs (sss-token, transfer-hook, oracle-module)
sdk/               → TypeScript SDK (@stbr/sss-token)
cli/               → CLI tool (sss-token)
backend/           → Backend services (Fastify + Docker)
tui/               → Interactive Admin TUI
frontend/          → Example React frontend
tests/             → Integration and unit tests
docs/              → Documentation
deployments/       → Devnet deployment proof
```

## Documentation

- [SSS-1 Standard](docs/SSS-1.md) — Minimal stablecoin
- [SSS-2 Standard](docs/SSS-2.md) — Compliant stablecoin
- [SSS-3 Standard](docs/SSS-3.md) — Private stablecoin (experimental)
- [Architecture](ARCHITECTURE.md) — System design
- [SDK Reference](docs/SDK.md) — TypeScript SDK
- [Operations](docs/OPERATIONS.md) — Operator runbook
- [API Reference](docs/API.md) — Backend REST API
- [Compliance](docs/COMPLIANCE.md) — Regulatory guide
- [Oracle](docs/ORACLE.md) — Oracle integration

## License

MIT
