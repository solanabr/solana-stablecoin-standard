<div align="center">

# Solana Stablecoin Standard (SSS)

**Production-ready Token-2022 stablecoin framework with preset-driven compliance tiers**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Tests](https://img.shields.io/badge/Tests-203%20Passing-success)](./tests)
[![Devnet](https://img.shields.io/badge/Devnet-Live-orange)](https://explorer.solana.com/?cluster=devnet)
[![Anchor](https://img.shields.io/badge/Anchor-0.31.1-blueviolet)](https://www.anchor-lang.com/)
[![Token-2022](https://img.shields.io/badge/Token--2022-6.0.0-green)](https://spl.solana.com/token-2022)

[Devnet Programs](#devnet-deployment) • [Quick Start](#quick-start) • [Documentation](./docs) • [Architecture](#architecture)

</div>

---

## What is SSS?

The **Solana Stablecoin Standard** (SSS) is an open-source SDK, on-chain programs, and operational tooling for issuing **Token-2022 stablecoins** on Solana. SSS provides three preset-driven configurations that let issuers launch anything from a minimal mint-authority token to a fully compliant stablecoin with blacklists, transfer hooks, permanent delegates, and asset seizure.

### Three Tiers, One Standard

SSS standardizes stablecoin issuance through a 3-tier preset system:

| Tier | Description | Use Case |
|------|-------------|----------|
| **SSS-1** | Minimal stablecoin with basic issuance controls | Internal tokens, no regulatory requirements |
| **SSS-2** | Full compliance with blacklist, seizure, KYC gating | Regulated stablecoins, OFAC compliance |
| **SSS-3** | Allowlist enforcement + supply caps | Securities tokens, permissioned stablecoins, CBDC-like tokens |

---

## Architecture

SSS is organized as a layered system where TypeScript SDK and CLI tools interact with two on-chain Anchor programs, all built on Token-2022.

```
┌─────────────────────────────────────────────────────────────────┐
│                     Frontend + CLI Layer                         │
│  • React + Vite Dashboard (stablecoin explorer, compliance UI)  │
│  • sss-token CLI (22 commands for all operations)               │
└─────────────────────────────────────────────────────────────────┘
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                       TypeScript SDK                             │
│  • SolanaStablecoin class (core operations)                     │
│  • ComplianceApi (blacklist, seize)                             │
│  • RolesApi (role management)                                   │
│  • Preset builders (SSS-1, SSS-2, SSS-3)                        │
└─────────────────────────────────────────────────────────────────┘
                              ▼
┌──────────────────────┬──────────────────────────────────────────┐
│   Shared Modules     │         Backend Services                 │
│  • sss-compliance    │  • Mint/Burn Service (REST API)          │
│  • sss-oracle        │  • Compliance Service (audit logs)       │
│  • sss-privacy       │  • Indexer (event streaming)             │
│                      │  • Webhook Service (integrations)        │
└──────────────────────┴──────────────────────────────────────────┘
                              ▼
┌────────────────────────┬────────────────────────────────────────┐
│      sss-core          │       sss-transfer-hook                │
│  (22 instructions)     │    (transfer enforcement)              │
│                        │                                        │
│  • initialize          │  • execute (blacklist check)           │
│  • mint_tokens         │  • initialize_extra_account_metas      │
│  • burn_tokens         │                                        │
│  • freeze/thaw         │  Dual-entry pattern:                   │
│  • pause/unpause       │  ✓ Anchor discriminator                │
│  • roles (6 types)     │  ✓ SPL Interface discriminator         │
│  • blacklist (SSS-2)   │                                        │
│  • seize (SSS-2)       │  Fail-closed enforcement:              │
│  • metadata update     │  • Blocks if config unreadable         │
│  • authority transfer  │  • Checks pause at byte 136            │
│                        │  • PDA-existence = blacklisted         │
└────────────────────────┴────────────────────────────────────────┘
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                 Solana Runtime + Token-2022                      │
│  • MetadataPointer + TokenMetadata (SSS-1/2/3)                  │
│  • PermanentDelegate (SSS-2 only, for seizure)                  │
│  • TransferHook (SSS-2 only, for compliance enforcement)        │
│  • DefaultAccountState(Frozen) (SSS-2 only, for KYC gating)     │
└─────────────────────────────────────────────────────────────────┘
```

**Key Design Decisions:**
- **PDA-based roles**: Role existence = PDA existence. Grant creates account, revoke closes it.
- **Permanent delegate for seize**: Config PDA can burn from any account without signature (SSS-2 only).
- **Transfer hook for compliance**: Every transfer triggers blacklist + pause check (SSS-2 only).
- **Fail-closed enforcement**: Transfer hook blocks if config is unreadable or paused.
- **Zero-cost for compliant users**: Blacklist check is a PDA lookup (no data read if not blacklisted).

---

## Feature Comparison

|                              | SSS-1 | SSS-2 | SSS-3 |
|------------------------------|:-----:|:-----:|:-----:|
| **Core Features**            |       |       |       |
| Mint authority               |   ✅   |   ✅   |   ✅   |
| Freeze authority             |   ✅   |   ✅   |   ✅   |
| Token metadata (on-chain)    |   ✅   |   ✅   |   ✅   |
| Role-based access (6 roles)  |   ✅   |   ✅   |   ✅   |
| Per-minter quotas            |   ✅   |   ✅   |   ✅   |
| Global pause                 |   ✅   |   ✅   |   ✅   |
| Two-step authority transfer  |   ✅   |   ✅   |   ✅   |
| **Compliance Features**      |       |       |       |
| Permanent delegate           |   ❌   |   ✅   |   ❌   |
| Transfer hook (blacklist)    |   ❌   |   ✅   |   ❌   |
| Default account state        |   ❌   |  Frozen (KYC)  |   ❌   |
| Blacklist + seize            |   ❌   |   ✅   |   ❌   |
| **Advanced Features**        |       |       |       |
| Allowlist controls           |   ❌   |   ❌   | ✅ (Experimental) |
| Supply cap enforcement       |   ❌   |   ❌   | ✅ (Experimental) |
| Confidential transfers       |   ❌   |   ❌   | 🔬 (Future) |

**Legend:**
- **SSS-1**: Simplest stablecoin. Mint, burn, freeze, pause. No compliance extensions.
- **SSS-2**: Full regulatory compliance. All SSS-1 features + permanent delegate, transfer hook enforcement, default-frozen accounts (KYC gating), blacklisting, and atomic asset seizure.
- **SSS-3**: Permissioned stablecoin with allowlist-only transfers and supply caps. Only explicitly approved addresses can hold tokens. Suitable for securities tokens and regulated CBDC-like deployments.

---

## Quick Start

### Prerequisites

- **Rust** (stable toolchain)
- **Solana CLI** (v1.18+)
- **Anchor CLI** (v0.31+)
- **Node.js** (v18+)
- **pnpm** (v10+)

### Installation and Build

```bash
# Clone the repository
git clone https://github.com/solanabr/solana-stablecoin-standard
cd solana-stablecoin-standard

# Install dependencies
pnpm install

# Build the Anchor programs
anchor build

# Run the full test suite (203 tests)
anchor test
```

### Deploy Your First Stablecoin

```bash
# Initialize the CLI configuration
pnpm --filter @stbr/sss-token exec sss-token config init
pnpm --filter @stbr/sss-token exec sss-token config set cluster devnet

# Deploy an SSS-1 stablecoin (minimal, no compliance)
pnpm --filter @stbr/sss-token exec sss-token init \
  --preset sss-1 \
  --name "Simple USD" \
  --symbol SUSD \
  --decimals 6

# Or deploy an SSS-2 stablecoin (full compliance)
pnpm --filter @stbr/sss-token exec sss-token init \
  --preset sss-2 \
  --name "Regulated USD" \
  --symbol RUSD \
  --decimals 6
```

### SDK Usage

```typescript
import { AnchorProvider, Program } from "@coral-xyz/anchor";
import { SolanaStablecoin, Presets } from "@sss/core";

// Initialize the stablecoin SDK
const { stablecoin, txSignature, mintKeypair } = await SolanaStablecoin.create(
  program,
  {
    preset: Presets.SSS_2,
    name: "My Stablecoin",
    symbol: "MYUSD",
    decimals: 6,
    uri: "https://example.com/metadata.json",
  }
);

// Mint tokens to a recipient
const mintSig = await stablecoin.mint(
  recipientPublicKey,
  1_000_000_000 // 1,000 tokens (6 decimals)
);

// Freeze an account (SSS-1 and SSS-2)
await stablecoin.freezeAccount(tokenAccountAddress);

// SSS-2 specific: Blacklist an address
await stablecoin.compliance.addToBlacklist(
  suspiciousAddress,
  "OFAC sanctions list match"
);

// SSS-2 specific: Seize assets from a blacklisted account
await stablecoin.compliance.seize(
  fromOwner,
  toOwner,
  amountToSeize
);
```

---

## Project Structure

```
solana-stablecoin-standard/
├── programs/
│   ├── sss-core/                  # Core Anchor program (22 instructions)
│   │   └── src/
│   │       ├── lib.rs             # Program entrypoint
│   │       ├── state.rs           # StablecoinConfig, RoleAssignment, MinterQuota, BlacklistEntry
│   │       ├── instructions/      # 22 instruction handlers
│   │       ├── constants.rs       # PDA seeds, role bytes
│   │       ├── error.rs           # 30 custom error codes
│   │       └── events.rs          # 21 Anchor events
│   └── sss-transfer-hook/         # Transfer hook program (2 instructions)
│       └── src/
│           ├── lib.rs             # Dual-entry pattern (Anchor + SPL discriminator)
│           ├── constants.rs       # Shared PDA seeds
│           └── error.rs           # Transfer hook errors
├── modules/
│   ├── sss-compliance/            # Shared compliance types and validation
│   ├── sss-oracle/                # Pyth/Switchboard price feed integration
│   └── sss-privacy/               # Privacy types for SSS-3
├── sdk/
│   ├── core/                      # TypeScript SDK + CLI
│   │   ├── src/
│   │   │   ├── client.ts          # SolanaStablecoin class
│   │   │   ├── compliance.ts      # ComplianceApi class
│   │   │   ├── roles.ts           # RolesApi class
│   │   │   ├── presets.ts         # Preset configuration builders
│   │   │   └── cli/               # CLI command modules (22 commands)
│   │   └── tests/                 # SDK unit tests
│   └── react/                     # React hooks for frontend integration
├── frontend/                      # React + Vite dashboard
│   └── src/
│       ├── components/            # UI components (stablecoin explorer, compliance panel)
│       ├── contexts/              # React contexts (wallet, program)
│       └── pages/                 # Dashboard pages
├── backend/                       # Docker Compose microservices
│   ├── mint-burn-service/         # REST API for mint/burn requests
│   ├── compliance-service/        # Blacklist + seize + audit logs
│   ├── indexer/                   # Event indexing + WebSocket streaming
│   └── webhook-service/           # Webhook registration and delivery
├── tests/                         # Anchor integration tests (11 test files, 203 tests)
├── trident-tests/                 # Fuzz and invariant tests (50,000 ops)
├── docs/                          # Comprehensive documentation
│   ├── ARCHITECTURE.md            # Architecture deep-dive
│   ├── SDK.md                     # SDK API reference
│   ├── API.md                     # Backend API reference
│   ├── SSS-1.md                   # SSS-1 specification
│   ├── SSS-2.md                   # SSS-2 specification
│   ├── COMPLIANCE.md              # Compliance design rationale
│   └── OPERATIONS.md              # Deployment and operational procedures
├── scripts/
│   └── devnet-smoke-test.ts       # 39-transaction smoke test (generates DEVNET_EVIDENCE.md)
├── Anchor.toml
├── Cargo.toml
├── package.json
└── LICENSE                        # MIT
```

---

## Devnet Deployment

Both programs are **live on devnet** with 39 verified transactions exercising all instructions.

### Program IDs

| Program | Program ID | Explorer |
|---------|------------|----------|
| **sss-core** | `G3jadBDzaF2HbTY2at5auYYQQ94zhhWaocMuWDgUy2vL` | [View](https://explorer.solana.com/address/G3jadBDzaF2HbTY2at5auYYQQ94zhhWaocMuWDgUy2vL?cluster=devnet) |
| **sss-transfer-hook** | `EAzHNW2cjpYdBjLBJ9RVLoGryXQJE98dpHTdyPiE6389` | [View](https://explorer.solana.com/address/EAzHNW2cjpYdBjLBJ9RVLoGryXQJE98dpHTdyPiE6389?cluster=devnet) |

### Deployed Mints (Smoke Test)

| Preset | Mint Address | Explorer |
|--------|--------------|----------|
| **SSS-1** | `6VC1JUoCPLbNUu9CcvLYFpHupSDasgoiehbeBSdF6Lmp` | [View](https://explorer.solana.com/address/6VC1JUoCPLbNUu9CcvLYFpHupSDasgoiehbeBSdF6Lmp?cluster=devnet) |
| **SSS-2** | `23d3wEp7D2mrWb9YZUb5UmH564gjGDZmyKQp2M5WxWXC` | [View](https://explorer.solana.com/address/23d3wEp7D2mrWb9YZUb5UmH564gjGDZmyKQp2M5WxWXC?cluster=devnet) |
| **SSS-3** | `HabX8jwtDqAw53BPiBBkAYNB1jS9NU9DrH6rLFT7JBqM` | [View](https://explorer.solana.com/address/HabX8jwtDqAw53BPiBBkAYNB1jS9NU9DrH6rLFT7JBqM?cluster=devnet) |

### Run the Smoke Test

```bash
npx ts-node scripts/devnet-smoke-test.ts
```

This executes 39 transactions covering:
- **SSS-1 lifecycle**: init, grant_role, set_quota, mint, burn, freeze, thaw, pause, unpause, set_metadata, propose/cancel/transfer authority, revoke_role
- **SSS-2 compliance lifecycle**: init with 4 roles, mint, add_to_blacklist, freeze, seize (atomic thaw-burn-refreeze-mint), remove_from_blacklist
- **SSS-3 advanced features**: init with supply cap, allowlist management, quota enforcement

All signatures are logged to `DEVNET_EVIDENCE.md` with [Solana Explorer](https://explorer.solana.com/?cluster=devnet) links.

---

## CLI Usage

The `sss-token` CLI provides 22 commands for all stablecoin operations.

### Core Operations

```bash
# Initialize a new stablecoin (SSS-2 preset)
sss-token init --preset sss-2 --name "My Stable" --symbol MYUSD --decimals 6

# Dry-run to preview config without deploying
sss-token init --preset sss-2 --dry-run

# Mint tokens to a recipient
sss-token mint <recipient-pubkey> 1000000

# Burn tokens from your account
sss-token burn 500000

# Check on-chain status and supply
sss-token status
sss-token supply
```

### Account Management

```bash
# Freeze / thaw a token account
sss-token freeze <token-account>
sss-token thaw <token-account>

# Pause / unpause all operations
sss-token pause
sss-token unpause
```

### Role Management

```bash
# Grant and revoke roles
sss-token roles grant minter <address>
sss-token roles revoke minter <address>
sss-token roles check minter <address>

# Convenience wrappers for minter management
sss-token minters add <address> --quota 1000000
sss-token minters remove <address>
sss-token minters quota <address>
```

### Authority Transfer

```bash
# Two-step authority transfer (safe)
sss-token authority propose <new-authority-pubkey>
sss-token authority accept    # called by the new authority
sss-token authority cancel    # called by current authority
```

### Metadata Updates

```bash
# Update token metadata fields
sss-token set-metadata name "New Name"
sss-token set-metadata symbol "NEWSYM"
sss-token set-metadata uri "https://example.com/metadata.json"
```

### Compliance Operations (SSS-2 only)

```bash
# Blacklist management
sss-token blacklist add <address> --reason "OFAC match"
sss-token blacklist remove <address>
sss-token blacklist check <address>

# Asset seizure (atomic thaw-burn-refreeze-mint)
sss-token seize <from-owner> --to <treasury-owner> --amount 100000
```

### Queries and Auditing

```bash
# Token holder and audit queries
sss-token holders --min-balance 1000
sss-token audit-log --limit 50

# All commands support --output json for scripting
sss-token status --output json
```

### Configuration

```bash
# Configuration management
sss-token config init
sss-token config show
sss-token config set cluster devnet
sss-token config set mintAddress <mint-address>
sss-token config set keypairPath ~/.config/solana/id.json
```

---

## Frontend

The React + Vite dashboard provides a user-friendly interface for stablecoin management and compliance operations.

### Features

- **Stablecoin Explorer**: View all stablecoins, their metadata, supply, and status
- **Compliance Panel**: Blacklist management, asset seizure, audit logs
- **Role Management**: Grant/revoke roles, set quotas, view role assignments
- **Operations Dashboard**: Mint, burn, freeze, thaw, pause/unpause
- **Real-time Updates**: WebSocket integration with indexer service for live event streaming

### Run the Frontend

```bash
cd frontend
pnpm install
pnpm dev
```

Open [http://localhost:5173](http://localhost:5173) to view the dashboard.

**Screenshots**: *(Frontend provides live stablecoin explorer with compliance controls, role management panel, and real-time event stream)*

---

## Security

SSS implements multiple layers of security through design, testing, and formal verification.

### Design Principles

1. **PDA-based roles**: Role existence = PDA existence. No central registry, no role enumeration attacks.
2. **Permanent delegate for seize**: Config PDA (not a wallet) is the permanent delegate. Only the seize instruction can invoke it.
3. **Transfer hook fail-closed**: If config is unreadable or paused, all transfers are blocked. No bypass possible.
4. **Two-step authority transfer**: New authority must accept the transfer. Prevents accidental loss of control.
5. **Quota enforcement**: Per-minter quotas prevent runaway minting. Checked on every mint operation.
6. **Pause enforcement**: Pause affects transfers (via hook), mint, burn, freeze, thaw, and seize. Admin operations remain available.

### Testing Coverage

#### Integration Tests (203 tests across 11 files)

- **Lifecycle tests**: Full SSS-1, SSS-2, SSS-3 initialization and operation flows
- **Role tests**: Grant, revoke, quota enforcement, role-gated operations
- **Compliance tests**: Blacklist add/remove, seize, transfer hook enforcement
- **Authority tests**: Two-step transfer, propose/accept/cancel
- **Edge cases**: Zero amounts, quota exhaustion, paused operations, unauthorized access

#### Security-Specific Test Suites

| Test Suite | Focus |
|------------|-------|
| `tests/security-authority-escalation.ts` | Unauthorized role grants, quota manipulation, authority theft |
| `tests/security-blacklist-bypass.ts` | Transfer after blacklist, SSS-1/SSS-2 boundary enforcement |
| `tests/security-overflow.ts` | u64 overflow, quota exhaustion, zero-amount edge cases |

#### Invariant-Based Fuzz Testing

The `trident-tests/fuzz_0/test_fuzz.rs` state-machine fuzzer runs **50,000 randomized operations** across 10 seeds, checking after every operation:

1. **Supply conservation**: `total_minted >= total_burned` (always)
2. **Net supply consistency**: `total_minted - total_burned == on-chain supply`
3. **Quota enforcement**: minter cannot exceed `quota_limit`
4. **Seize conservation**: seize doesn't change net supply (atomic burn+mint)
5. **Pause enforcement**: no mint/burn while paused
6. **Role consistency**: grant + revoke are inverse operations
7. **Blacklist enforcement**: compliance gating per preset
8. **Authority safety**: two-step transfer requires accept

Run the fuzzer:

```bash
cargo run --bin fuzz_0    # Runs all 50,000 ops + deterministic + edge cases
```

### Transfer Hook Security

The transfer hook uses a **dual-entry pattern** and **fail-closed logic**:

- **Dual-entry**: Handles both Anchor discriminator (for testing) and SPL Interface discriminator (for Token-2022)
- **Fail-closed**: If config PDA cannot be read or verified, the transfer is **blocked**
- **Pause at byte 136**: Reads pause flag directly from raw account data (no deserialization overhead)
- **PDA existence = blacklisted**: Zero-cost check for non-blacklisted users

---

## Technical Details

### Token-2022 Extensions

SSS leverages the following Token-2022 extensions:

| Extension | Presets | Purpose |
|-----------|---------|---------|
| **MetadataPointer** | SSS-1, SSS-2, SSS-3 | Points mint to itself as the metadata account |
| **TokenMetadata** | SSS-1, SSS-2, SSS-3 | Stores name, symbol, URI directly on the mint |
| **PermanentDelegate** | SSS-2 | Allows config PDA to burn tokens from any account (for seizure) |
| **TransferHook** | SSS-2 | Triggers blacklist + pause check on every transfer |
| **DefaultAccountState** | SSS-2 | New token accounts start frozen (KYC gating) |

### Extension Initialization Order

Extensions must be initialized **before** `initialize_mint2`:

1. **MetadataPointer** (always)
2. **PermanentDelegate** (if compliance_enabled)
3. **TransferHook** (if compliance_enabled)
4. **DefaultAccountState** (if compliance_enabled)
5. **initialize_mint2** (sets mint authority + freeze authority to config PDA)
6. **TokenMetadata initialize** (writes name/symbol/uri)

### PDA Derivation

| Account | Seeds | Program |
|---------|-------|---------|
| StablecoinConfig | `[b"config", mint.key()]` | sss-core |
| RoleAssignment | `[b"role", [role_byte], holder.key()]` | sss-core |
| MinterQuota | `[b"quota", config.key(), minter.key()]` | sss-core |
| BlacklistEntry | `[b"blacklist", config.key(), address.key()]` | sss-core |
| ExtraAccountMetaList | `[b"extra-account-metas", mint.key()]` | sss-transfer-hook |

### Event System

All state-changing operations emit Anchor events for off-chain indexing:

- `StablecoinInitialized`, `TokensMinted`, `TokensBurned`
- `AccountFrozen`, `AccountThawed`
- `StablecoinPaused`, `StablecoinUnpaused`
- `AuthorityTransferred`, `AuthorityProposed`, `AuthorityTransferCancelled`
- `RoleGranted`, `RoleRevoked`, `QuotaSet`
- `AddressBlacklisted`, `AddressUnblacklisted`, `TokensSeized`
- `MetadataUpdated`, `SupplyCapUpdated`
- `AllowlistAdded`, `AllowlistRemoved`
- `OracleConfigured`

Events are stored in transaction logs and can be parsed by the backend indexer service or any Solana event listener.

---

## Documentation

Comprehensive documentation is available in the `docs/` directory:

- **[ARCHITECTURE.md](docs/ARCHITECTURE.md)** — Layered design, account structures, PDA derivation, Token-2022 extensions, transfer hook design, security model
- **[SDK.md](docs/SDK.md)** — TypeScript SDK API reference with full examples
- **[API.md](docs/API.md)** — REST API reference for all backend microservices
- **[SSS-1.md](docs/SSS-1.md)** — Minimal stablecoin specification
- **[SSS-2.md](docs/SSS-2.md)** — Compliant stablecoin specification
- **[SSS-3.md](docs/SSS-3.md)** — Allowlist stablecoin specification
- **[COMPLIANCE.md](docs/COMPLIANCE.md)** — Compliance design rationale and regulatory considerations
- **[OPERATIONS.md](docs/OPERATIONS.md)** — Deployment procedures and operational runbook

---

## Backend Services

The `backend/` directory contains four Docker Compose microservices:

| Service | Purpose | Tech Stack |
|---------|---------|------------|
| **mint-burn-service** | REST API for mint/burn requests with approval workflow | Node.js, Express, PostgreSQL |
| **compliance-service** | Blacklist + seize + audit logs with webhook notifications | Node.js, Express, PostgreSQL |
| **indexer** | Event indexing from Anchor events + WebSocket streaming | Node.js, WebSocket, Redis |
| **webhook-service** | Webhook registration and delivery for external integrations | Node.js, Express, Bull (job queue) |

Start all services:

```bash
cd backend
docker compose up --build
```

See [docs/API.md](docs/API.md) for full REST API reference.

---

## Development

### Build and Test

```bash
# Build programs
anchor build

# Run all tests (starts solana-test-validator automatically)
anchor test

# Run SDK unit tests only
pnpm test:sdk

# Build TypeScript SDK
pnpm --filter @stbr/sss-token build

# Run fuzz tests (50,000 operations)
cargo run --bin fuzz_0

# Start backend services
cd backend && docker compose up --build

# Run frontend
cd frontend && pnpm dev
```

### Test Statistics

- **Total tests**: 203 passing
- **Integration tests**: 11 test files covering all 22 instructions
- **Security tests**: 3 dedicated security test suites
- **Fuzz tests**: 50,000+ randomized operations with 8 invariants

---

## License

MIT — see [LICENSE](LICENSE) for details.

---

<div align="center">

**Built with Anchor 0.31.1 • Token-2022 6.0.0 • Solana 1.18+**

[Report Bug](https://github.com/solanabr/solana-stablecoin-standard/issues) • [Request Feature](https://github.com/solanabr/solana-stablecoin-standard/issues) • [Documentation](./docs)

</div>
