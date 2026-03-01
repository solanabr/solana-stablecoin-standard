# Solana Stablecoin Standard (SSS)

A modular, production-grade stablecoin SDK with standardized presets for Solana. Built on Token-2022 with composable compliance modules and role-based access control.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  Layer 3: Standard Presets                                       │
│  ┌─────────────────────┐  ┌──────────────────────────────────┐  │
│  │  SSS-1 (Minimal)    │  │  SSS-2 (Compliant)               │  │
│  │  Mint + Freeze +    │  │  SSS-1 + Permanent Delegate +    │  │
│  │  Metadata            │  │  Transfer Hook + Blacklist       │  │
│  └─────────────────────┘  └──────────────────────────────────┘  │
├─────────────────────────────────────────────────────────────────┤
│  Layer 2: Composable Modules                                     │
│  ┌──────────────────┐  ┌──────────────────────────────────────┐ │
│  │  Compliance       │  │  Privacy (future)                   │ │
│  │  Transfer Hook    │  │  Confidential Transfers             │ │
│  │  Blacklist PDAs   │  │  Allowlists                         │ │
│  │  Permanent Delegate│  │                                    │ │
│  └──────────────────┘  └──────────────────────────────────────┘ │
├─────────────────────────────────────────────────────────────────┤
│  Layer 1: Base SDK                                               │
│  Token-2022 Mint • Role Management • CLI • TypeScript SDK        │
└─────────────────────────────────────────────────────────────────┘
```

## Presets

### SSS-1: Minimal Stablecoin
- Mint authority + freeze authority + metadata
- Role-based access: master authority, minter (with quotas), burner, pauser
- For: simple stablecoins, DAO treasuries, community tokens

### SSS-2: Compliant Stablecoin
- Everything in SSS-1 plus:
- **Permanent delegate**: seize tokens from blacklisted accounts
- **Transfer hook**: block transfers to/from blacklisted addresses
- **Blacklist management**: add/remove addresses with reasons
- Additional roles: blacklister, seizer
- For: regulated stablecoins (USDC/USDT-class)

## Monorepo Structure

```
/programs/sss-token/         — Anchor program (core stablecoin logic)
/programs/transfer-hook/     — Transfer hook program (SSS-2 blacklist enforcement)
/sdk/                        — TypeScript SDK (@stbr/sss-token)
/cli/                        — Admin CLI (sss-token)
/services/                   — Backend services
  /mint-burn/                — Mint/burn REST API service
  /indexer/                  — Event listener/indexer
  /compliance/               — Compliance service (SSS-2)
  /webhook/                  — Webhook dispatch service
/tests/                      — Integration tests
/docs/                       — Documentation
```

## Quick Start

### Prerequisites
- Rust 1.79+
- Solana CLI 2.x
- Anchor CLI 0.30.1+
- Node.js 20+
- Yarn

### Build

```bash
# Clone
git clone https://github.com/solanabr/solana-stablecoin-standard.git
cd solana-stablecoin-standard

# Build Anchor programs
anchor build

# Install JS dependencies
yarn install

# Build SDK
cd sdk && yarn build

# Build CLI
cd ../cli && yarn build
```

### Test

```bash
# Run Anchor tests (starts local validator)
anchor test

# Run specific test
anchor test -- --grep "SSS-1"
```

### Deploy to Devnet

```bash
solana config set --url devnet
anchor deploy --provider.cluster devnet
```

## TypeScript SDK

```typescript
import { SolanaStablecoin, Presets } from "@stbr/sss-token";

// Create an SSS-1 stablecoin
const stable = await SolanaStablecoin.create(
  connection,
  wallet,
  Presets.SSS1({ name: "MyStable", symbol: "MSTB", decimals: 6 })
);

// Add a minter
await stable.updateMinter(minterPubkey, 1_000_000_000); // 1000 token quota

// Mint tokens
await stable.mint(recipientPubkey, 100_000_000); // 100 tokens

// Pause/unpause
await stable.pause();
await stable.unpause();

// Load an existing stablecoin
const existing = await SolanaStablecoin.load(connection, wallet, mintPubkey);
```

### SSS-2 Compliance

```typescript
// Create an SSS-2 stablecoin
const compliant = await SolanaStablecoin.create(
  connection,
  wallet,
  Presets.SSS2({ name: "RegStable", symbol: "RSTB" })
);

// Assign compliance roles
await compliant.updateRole(Role.Blacklister, operatorPubkey, true);
await compliant.updateRole(Role.Seizer, operatorPubkey, true);

// Blacklist management
await compliant.addToBlacklist(suspectPubkey, "OFAC match");
await compliant.removeFromBlacklist(clearedPubkey);

// Seize tokens from blacklisted account
await compliant.seize(blacklistedPubkey, treasuryPubkey);
```

## CLI

```bash
# Initialize a stablecoin
sss-token init --preset sss-1 --name "MyStable" --symbol "MSTB"
sss-token init --preset sss-2 --name "RegStable" --symbol "RSTB"
sss-token init --custom config.toml

# Token operations
sss-token mint <recipient> <amount>
sss-token burn <amount>
sss-token freeze <address>
sss-token thaw <address>
sss-token pause
sss-token unpause

# Status
sss-token status --mint <address>
sss-token supply --mint <address>

# Compliance (SSS-2)
sss-token blacklist add <address> --reason "OFAC match"
sss-token blacklist remove <address>
sss-token seize <address> --to <treasury>

# Minter management
sss-token minters list
sss-token minters add <address> --quota 1000000
sss-token minters remove <address>

# Analytics
sss-token holders --min-balance 1000
sss-token audit-log --action mint
```

## On-Chain Program

### Role-Based Access Control

| Role | Permissions |
|------|------------|
| Master Authority | All operations, role management, authority transfer |
| Minter | Mint tokens (within quota) |
| Burner | Burn tokens |
| Pauser | Pause/unpause minting and burning |
| Blacklister (SSS-2) | Add/remove addresses from blacklist |
| Seizer (SSS-2) | Seize tokens from blacklisted accounts |

### Instructions

**Core (all presets):**
- `initialize` — Create a new stablecoin with configuration
- `mint_tokens` — Mint tokens to a recipient
- `burn_tokens` — Burn tokens from an account
- `freeze_account` — Freeze a token account
- `thaw_account` — Thaw a frozen account
- `pause` / `unpause` — Global pause toggle
- `update_minter` — Add/update a minter with quota
- `remove_minter` — Remove a minter
- `update_roles` — Assign/revoke roles
- `transfer_authority` — Transfer master authority

**SSS-2 additional:**
- `add_to_blacklist` — Blacklist an address with reason
- `remove_from_blacklist` — Remove from blacklist
- `seize` — Seize tokens via permanent delegate

### PDA Seeds

| Account | Seeds |
|---------|-------|
| StablecoinState | `["stablecoin", mint]` |
| MinterState | `["minter", stablecoin, minter]` |
| RoleAssignment | `["role", stablecoin, role_name, assignee]` |
| BlacklistEntry | `["blacklist", stablecoin, target]` |

## Backend Services

Start all services with Docker:

```bash
docker-compose up -d
```

| Service | Port | Description |
|---------|------|-------------|
| mint-burn | 3001 | REST API for mint/burn operations |
| compliance | 3002 | Blacklist checks, seize operations |
| webhook | 3003 | Event webhook dispatch |
| indexer | — | Log listener, event processing |

### Environment Variables

```env
RPC_URL=https://api.devnet.solana.com
WS_URL=wss://api.devnet.solana.com
SSS_PROGRAM_ID=SSStoken11111111111111111111111111111111111
SSS_KEYPAIR=/path/to/keypair.json
LOG_LEVEL=info
PORT=3001
```

## Security Considerations

- **Two-step authority transfer** recommended for production
- **Minter quotas** prevent unlimited minting
- **Global pause** provides emergency stop capability
- **Role separation** follows principle of least privilege
- **Blacklist entries** include timestamps and reasons for audit trail
- All state changes emit program logs for indexing

## License

MIT
