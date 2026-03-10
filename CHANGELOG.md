# Changelog

All notable changes to the Solana Stablecoin Standard will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## [0.1.0] - 2026-03-10

### Added

- **sss-core program**: Core stablecoin program supporting SSS-1 (Minimal) and SSS-2 (Compliant) presets
  - Token-2022 mint initialization with conditional extensions based on preset
  - Role-based access control: authority, master_minter, pauser, blacklister
  - Minter quota management (configure, remove, re-enable)
  - Mint and burn operations with quota enforcement
  - Freeze/thaw token accounts (works even when paused)
  - Pause/unpause all operations
  - Two-step authority transfer
  - Token seizure via permanent delegate (SSS-2 only)
  - Full event emission for all state changes

- **sss-hook program**: Transfer hook for SSS-2 compliance enforcement
  - ExtraAccountMetaList initialization with dynamic PDA resolution
  - Bidirectional blacklist checking on every transfer
  - Cross-program pause state verification
  - Blacklist management (add/remove) with role validation

- **sss-events module**: Shared event definitions for indexing and audit trails

- **TypeScript SDK** (`@sss/sdk`)
  - `StablecoinClient` for SSS-1 operations
  - `ComplianceClient` extending `StablecoinClient` for SSS-2 operations
  - PDA derivation helpers
  - Type-safe interfaces for all on-chain state

- **CLI** (`sss-token`)
  - Full command-line interface for all stablecoin operations
  - Support for table, JSON, and CSV output formats
  - Dry-run mode for safe operation preview

- **Backend services**: Docker-containerized Node.js/TypeScript services
  - REST API for mint/burn operations and supply queries
  - Event indexer with WebSocket subscription and SQLite storage
  - Compliance service for blacklist management and audit trails
  - Webhook service with HMAC-SHA256 signing and retry logic

- **CI/CD**: GitHub Actions workflow with build, test, and SDK build jobs

- **Deployment scripts**: `deploy.sh` for devnet/mainnet, `setup-local.sh` for development

- **Integration tests**: 52 passing tests covering SSS-1, SSS-2, access control, and edge cases
  - Full seize + transfer hook nested CPI flow verified
  - Trident fuzz tests for invariant checking

- **Devnet deployment**: Both programs deployed and verified
  - sss-core: `CZzvCtyZC8KR37DNDeGYpwN46YEc7WEh6RyeSRdhjY4Y`
  - sss-hook: `9aw7Ac4aGMMfND3BvYgGEcASuvyJiBXnQizbhNBphcNM`
  - IDL accounts published on-chain

- **Documentation**: Architecture guide, SDK reference, operator runbook, standard specifications, compliance guide, API reference
