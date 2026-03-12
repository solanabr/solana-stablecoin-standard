# Solana Stablecoin Standard (SSS)

> **Superteam Brazil Bounty Submission** — Open-Source SDK & Core Standards for Stablecoins on Solana

Modular Token-2022 stablecoin SDK with production-ready presets. Fork, customize, and deploy.

## Standards

| Standard | Name | Extensions | Use Case |
|----------|------|------------|----------|
| **SSS-1** | Minimal Stablecoin | Mint + Freeze + Metadata | DAO treasuries, ecosystem tokens, internal settlement |
| **SSS-2** | Compliant Stablecoin | SSS-1 + Permanent Delegate + Transfer Hook + Blacklist | USDC/USDT-class regulated stablecoins |

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                  Solana Stablecoin Standard                      │
├─────────────────────────────────────────────────────────────────┤
│  Layer 3 — Standard Presets                                      │
│  ┌─────────────────────┐  ┌──────────────────────────────────┐  │
│  │  SSS-1 (Minimal)    │  │  SSS-2 (Compliant)               │  │
│  │  Mint + Freeze      │  │  SSS-1 + PermanentDelegate +     │  │
│  │  + Metadata         │  │  TransferHook + Blacklist PDAs   │  │
│  └─────────────────────┘  └──────────────────────────────────┘  │
├─────────────────────────────────────────────────────────────────┤
│  Layer 2 — Modules                                               │
│  Compliance (blacklist, seize)  │  Role RBAC (minter quotas)    │
├─────────────────────────────────────────────────────────────────┤
│  Layer 1 — Base SDK                                              │
│  Token-2022 mint + extensions + metadata + freeze authority      │
│  TypeScript SDK  │  Admin CLI  │  Backend Services               │
└─────────────────────────────────────────────────────────────────┘
```

## Quick Start

```bash
# Install dependencies
yarn install

# Build on-chain programs
anchor build

# Run tests (requires local validator)
anchor test

# Or deploy to devnet
./scripts/deploy-devnet.sh ~/.config/solana/id.json
```

## On-Chain Programs

### Program IDs (Devnet)

| Program | Address | Explorer |
|---------|---------|----------|
| `sss-core` | `SSSXsBqANHdRRPBEiNUjGjgARJmQR1tQHNBqJBMvFUw` | [View ↗](https://explorer.solana.com/address/SSSXsBqANHdRRPBEiNUjGjgARJmQR1tQHNBqJBMvFUw?cluster=devnet) |
| `sss-transfer-hook` | `SSSHooKvTgEyqsX1mEBHXrLHyWzGGY9V8tECJpJPZyp` | [View ↗](https://explorer.solana.com/address/SSSHooKvTgEyqsX1mEBHXrLHyWzGGY9V8tECJpJPZyp?cluster=devnet) |

### Instructions

**Core (all presets):**
`initialize` · `mint_tokens` · `burn_tokens` · `freeze_account` · `thaw_account` · `pause` · `unpause` · `update_minter` · `update_role` · `transfer_authority`

**SSS-2 compliance:**
`add_to_blacklist` · `remove_from_blacklist` · `seize`

### Role-Based Access Control

| Role | Capability |
|------|-----------|
| Master Authority | Full control, role assignment |
| Minter | Mint tokens up to per-minter cap |
| Burner | Burn tokens |
| Pauser | Pause/unpause operations |
| Blacklister | Manage blacklist (SSS-2) |
| Seizer | Seize tokens from frozen accounts (SSS-2) |

## TypeScript SDK

```typescript
import { SolanaStablecoin, Preset } from "@stbr/sss-token";

// SSS-1: minimal stablecoin
const stable = await SolanaStablecoin.create(provider, program, {
  preset: Preset.SSS_1,
  name: "My Stablecoin",
  symbol: "MYUSD",
  decimals: 6,
});

// SSS-2: compliant stablecoin
const compliant = await SolanaStablecoin.create(provider, program, {
  preset: Preset.SSS_2,
  name: "Regulated USD",
  symbol: "RUSD",
});

// Custom config (no preset)
const custom = await SolanaStablecoin.create(provider, program, {
  name: "Custom Stable",
  symbol: "CUSD",
  decimals: 2,
  extensions: {
    permanentDelegate: true,
    transferHook: false,
    defaultAccountFrozen: false,
  },
});

// Operations
await stable.updateMinter(authority, minter.publicKey, { active: true, cap: 1_000_000_000n });
await stable.mintTokens(minter, recipient, 1_000_000n);
await stable.freezeAccount(authority, targetAccount);

// SSS-2 compliance
await compliant.compliance.blacklistAdd(authority, sanctionedAddress, "OFAC match");
await compliant.compliance.seize(authority, frozenAccount, treasury, amount);
const isBlacklisted = await compliant.compliance.isBlacklisted(address);
```

## Admin CLI

```bash
# Initialize
sss-token init --preset sss-1 --name "My USD" --symbol MUSD
sss-token init --preset sss-2 --name "Regulated USD" --symbol RUSD
sss-token init --custom config.toml     # fully custom via TOML config

# Token operations
sss-token mint <mint> <recipient> <amount>
sss-token burn <mint> <amount>
sss-token freeze <mint> <account>
sss-token thaw <mint> <account>
sss-token pause <mint>
sss-token unpause <mint>
sss-token status <mint>
sss-token supply <mint>

# Role management
sss-token minters list <mint>
sss-token minters add <mint> <address> [--cap <amount>]
sss-token minters remove <mint> <address>

# SSS-2 compliance
sss-token blacklist add <mint> <address> --reason "OFAC match"
sss-token blacklist remove <mint> <address>
sss-token blacklist check <mint> <address>
sss-token blacklist list <mint>
sss-token seize <mint> <frozen-account> <treasury>
```

## Backend Services

All services are Docker-containerized with structured logging and health checks.

```bash
docker compose up
```

| Service | Port | Description |
|---------|------|-------------|
| `mint-service` | 3001 | Fiat-to-stablecoin lifecycle (request → verify → execute → log) |
| `indexer` | 3002 | On-chain event indexer + webhook notifications |
| `compliance` | 3003 | Blacklist management + audit trail export (SSS-2) |

## Repository Structure

```
programs/
  sss-core/              # Main Anchor program (SSS-1 + SSS-2)
  sss-transfer-hook/     # Transfer hook: blacklist enforcement
modules/
  sss-math/              # Fixed-point math utilities
sdk/
  core/                  # @stbr/sss-token TypeScript SDK
cli/                     # sss-token admin CLI
services/
  mint-service/          # Fiat mint/burn coordination
  indexer/               # Event listener + webhook dispatcher
  compliance/            # Blacklist + audit trail (SSS-2)
tests/                   # Integration tests (SSS-1 + SSS-2 lifecycle)
trident-tests/           # Fuzz testing via Trident
docs/                    # Documentation
  ARCHITECTURE.md
  SDK.md
  SSS-1.md / SSS-2.md
  COMPLIANCE.md
  OPERATIONS.md
  API.md
.github/workflows/       # CI/CD: build, test, devnet deploy
scripts/
  deploy-devnet.sh       # Devnet deployment script
  smoke-test.js          # Post-deploy verification
```

## Security Design

- **No single key controls everything** — roles are strictly separated
- **Mint authority held by PDA** — the stablecoin state PDA is mint/freeze authority, enabling program-level CPIs without exposing private keys
- **Permanent delegate = PDA, not EOA** — seizure requires on-chain instruction execution, not a key compromise
- **Transfer hook cannot be bypassed** — Token-2022 enforces the hook on every transfer, including P2P
- **Blacklist entries are on-chain PDAs** — no off-chain database dependency during transfers
- **Checked arithmetic** — all token math uses `checked_*` ops
- **Pause circuit breaker** — master authority can halt all mint/burn operations immediately
- **SSS-2 feature gating** — compliance instructions fail gracefully on SSS-1 mints

## Testing

```bash
# Unit + integration tests (requires local validator)
anchor test

# Fuzz tests (requires Trident)
cd trident-tests && cargo test-fuzz
```

Tests cover:
- SSS-1 full lifecycle: initialize → mint → freeze → thaw → burn
- SSS-2 full lifecycle: initialize → mint → blacklist → freeze → seize
- Role-based access control (unauthorized rejections)
- Mint cap enforcement
- Pause/unpause circuit breaker
- Edge cases (zero amounts, non-existent PDAs, duplicate blacklist)

## Documentation

| Document | Contents |
|----------|---------|
| [ARCHITECTURE.md](./docs/ARCHITECTURE.md) | Layer model, data flows, security model |
| [SDK.md](./docs/SDK.md) | TypeScript SDK reference with examples |
| [SSS-1.md](./docs/SSS-1.md) | Minimal stablecoin standard spec |
| [SSS-2.md](./docs/SSS-2.md) | Compliant stablecoin standard spec |
| [COMPLIANCE.md](./docs/COMPLIANCE.md) | Regulatory considerations + audit trail |
| [OPERATIONS.md](./docs/OPERATIONS.md) | Operator runbook |
| [API.md](./docs/API.md) | Backend service API reference |

## CI/CD

GitHub Actions runs on every push:
1. **Rust lint** — clippy + rustfmt on all programs
2. **Build** — `anchor build` on ubuntu-latest
3. **Integration tests** — `anchor test` against localnet
4. **Devnet deploy** — auto-deploy on `main` branch push

See [`.github/workflows/build-and-test.yml`](./.github/workflows/build-and-test.yml)

## License

Apache 2.0
