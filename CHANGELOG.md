# Changelog

All notable changes to the Solana Stablecoin Standard will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## [0.1.0] - 2026-03-10

### Added

- On-chain seizure audit trail (`total_seized` counter in StablecoinConfig)
- Fail-closed transfer hook: pause check now blocks transfers when config is unreadable
- Blacklister role can freeze/thaw accounts on SSS-2 preset (compound constraint with authority)
- `Pubkey::default()` rejection in `transfer_authority` (prevents locking out authority)
- `ComplianceClient.seize()` with proper transfer hook account resolution
- 6 new integration tests: hook enforcement for blacklisted receiver, transfer after unblacklist, blacklister freeze/thaw on SSS-2, blacklister role blocked on SSS-1, zero-address authority rejection

### Fixed

- `seize` instruction now increments `total_seized` counter (config account marked `mut`)
- Removed `unwrap()` in SSS-2 initialization; replaced with `ok_or(SSSError::HookProgramRequired)`
- Access control test for pause: assert on error message instead of `assert.ok(true)`
- SSS-1 blacklister role assignment test: now correctly verifies `PresetFeatureUnavailable` instead of testing freeze

## [0.1.0-rc.1] - 2026-03-07

### Added

- Devnet deployment of both programs with published IDL accounts
  - sss-core: `CZzvCtyZC8KR37DNDeGYpwN46YEc7WEh6RyeSRdhjY4Y`
  - sss-hook: `9aw7Ac4aGMMfND3BvYgGEcASuvyJiBXnQizbhNBphcNM`
- Backend reference implementation with REST API, event indexer, webhook delivery
- Docker Compose multi-service configuration
- Deployment scripts (`deploy.sh`, `setup-local.sh`)
- CI/CD: GitHub Actions workflow for build, test, and SDK build

## [0.1.0-alpha.2] - 2026-03-04

### Added

- **TypeScript SDK** (`@sss/sdk`)
  - `StablecoinClient` for SSS-1 operations (initialize, mint, burn, freeze, thaw, pause, roles)
  - `ComplianceClient` extending `StablecoinClient` for SSS-2 (blacklist, hook init)
  - PDA derivation helpers for all program accounts
  - Type-safe interfaces matching on-chain state
- **CLI** (`sss-token`) with full command-line interface
  - Support for table, JSON, and CSV output formats
  - `--dry-run` mode for safe operation preview
- 52 integration tests across SSS-1, SSS-2, access control, and edge cases
- Full documentation suite: ARCHITECTURE.md, SDK.md, OPERATIONS.md, SSS-1/SSS-2 specs, COMPLIANCE.md, API.md

## [0.1.0-alpha.1] - 2026-02-28

### Added

- **sss-core program**: Core stablecoin program supporting SSS-1 (Minimal) and SSS-2 (Compliant) presets
  - Token-2022 mint initialization with conditional extensions based on preset
  - Role-based access control following Circle FiatToken v2 model
  - Minter quota management with lifetime ceiling (configure, remove, re-enable)
  - Mint and burn operations with quota enforcement and checked arithmetic
  - Freeze/thaw token accounts (works even when paused for compliance)
  - Pause/unpause all operations
  - Two-step authority transfer
  - Token seizure via permanent delegate (SSS-2 only)
  - Full event emission for all state changes
- **sss-hook program**: Transfer hook for SSS-2 compliance enforcement
  - ExtraAccountMetaList initialization with dynamic PDA resolution
  - Bidirectional blacklist checking (blocks both sending and receiving)
  - Cross-program pause state verification (fail-closed design)
  - Blacklist management (add/remove) with role validation
- **sss-events module**: Shared event definitions for indexing and audit trails
