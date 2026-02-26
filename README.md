# Solana Stablecoin Standard (SSS)

A production-grade framework for creating, managing, and operating stablecoins on Solana using Token-2022. Three preset tiers cover everything from simple internal tokens to fully regulated, privacy-preserving digital currencies.

```
                    +-----------------------+
                    |      Your App         |
                    |  (Frontend / Backend) |
                    +-----------+-----------+
                                |
                    +-----------v-----------+
                    |      @stbr/sss-token         |
                    |  TypeScript SDK       |
                    +---+-------+-------+---+
                        |       |       |
               +--------+  +---+---+  +--------+
               | SSS-1  |  | SSS-2 |  | SSS-3  |
               |Minimal |  |Comply |  |Private |
               +---+----+  +---+---+  +---+----+
                   |            |          |
            +------v------+    |   +------v------+
            |  sss-core   |    |   |  sss-core   |
            | (Anchor)    |    |   | + Confid.    |
            +-------------+    |   |   Transfers  |
                               |   +-------------+
                        +------v------+
                        |  sss-core   |
                        | + transfer  |
                        |   hook      |
                        +-------------+
```

## Preset Comparison

| Feature | SSS-1 (Minimal) | SSS-2 (Compliant) | SSS-3 (Private) |
|---|---|---|---|
| Mint / Burn | ✅ | ✅ | ✅ |
| Freeze / Thaw | ✅ | ✅ | ✅ |
| Pause / Unpause | ✅ | ✅ | ✅ |
| Seize (permanent delegate) | ✅ | ✅ | ✅ |
| Role-based access control | ✅ | ✅ | ✅ |
| On-chain metadata | ✅ | ✅ | ✅ |
| Supply cap enforcement | ✅ | ✅ | ✅ |
| Transfer hook (blacklist) | -- | ✅ | -- |
| Default frozen accounts | -- | ✅ | -- |
| Confidential transfers | -- | -- | ✅ |
| Auditor key (regulatory) | -- | -- | ✅ |
| **Use case** | Internal tokens | Regulated stablecoins | Privacy-preserving |

## Quick Start

### Prerequisites

- [Rust](https://rustup.rs/) 1.75+
- [Solana CLI](https://docs.solanalabs.com/cli/install) 1.18+
- [Anchor](https://www.anchor-lang.com/docs/installation) 0.32+
- [Node.js](https://nodejs.org/) 20+ with pnpm

### Build and Test

```bash
# Clone and install
git clone https://github.com/solanabr/solana-stablecoin-standard.git
cd solana-stablecoin-standard
pnpm install

# Build Anchor programs
anchor build

# Run integration tests (97 tests)
anchor test

# Run SDK unit tests (31 tests)
pnpm test:sdk

# Run Rust unit tests
cargo test
```

### Create Your First Stablecoin (TypeScript)

```typescript
import { SolanaStablecoin, Presets } from "@stbr/sss-token";
import { AnchorProvider } from "@coral-xyz/anchor";

// Set up provider (wallet + connection)
const provider = AnchorProvider.env();

// Create an SSS-2 compliant stablecoin
const stable = await SolanaStablecoin.create(provider, {
  preset: Presets.SSS_2,
  name: "My Stablecoin",
  symbol: "MUSD",
  decimals: 6,
});

// Or create with custom extensions (preset inferred automatically)
const custom = await SolanaStablecoin.create(provider, {
  name: "Custom Stable",
  symbol: "CUSD",
  extensions: { permanentDelegate: true, transferHook: false },
});

// Grant minter role, then mint tokens
await stable.roles.grant(minterWallet.publicKey, "minter");
await stable.mintTokens(recipientTokenAccount, 1_000_000n);

// Compliance operations (SSS-2)
await stable.compliance.blacklistAdd(address, "Sanctions match");
await stable.compliance.seize(frozenAccount, treasury, amount);
const supply = await stable.getTotalSupply();
console.log(`Supply: ${info.currentSupply}`);
```

### Create via CLI

```bash
# Build the CLI
cargo build --release --bin sss-token

# Initialize a new SSS-2 stablecoin
sss-token init \
  --preset sss-2 \
  --name "Regulated USD" \
  --symbol "rUSD" \
  --decimals 6 \
  --supply-cap 1000000000

# Mint tokens
sss-token mint --mint <MINT_ADDRESS> --to <TOKEN_ACCOUNT> --amount 1000000
```

## Features

**On-chain Programs (Anchor)**
- `sss-core` -- Universal stablecoin management with role-based access control, supply cap enforcement, pause/unpause, and permanent delegate seizure
- `sss-transfer-hook` -- Token-2022 transfer hook for blacklist enforcement with cross-program admin verification

**TypeScript SDK (`@stbr/sss-token`)**
- Preset-based stablecoin creation (SSS-1, SSS-2, SSS-3)
- Full token lifecycle operations (mint, burn, freeze, thaw, pause, seize)
- Role management (admin, minter, freezer, pauser, burner, blacklister, seizer)
- Per-minter quota enforcement and management
- Blacklist management for SSS-2
- Confidential transfer support for SSS-3 (deposit, apply pending)
- Typed error handling with error mapping

**Rust CLI (`sss-token`)**
- 20 subcommands covering all stablecoin operations
- TOML config file support (`--config`) for reproducible deployments
- Environment variable support for RPC URL and keypair
- Configurable commitment level

**Backend (Express)**
- REST API for all stablecoin operations
- API key authentication
- Rate limiting (30 req/min)
- Pluggable compliance/sanctions screening provider
- Fiat lifecycle verification flow (request → verify → execute)
- WebSocket event listener with webhook notifications
- Health check endpoint

**TUI (ratatui)**
- Terminal-based dashboard for stablecoin management

**Frontend (Next.js 15)**
- Web interface for stablecoin operations

## Project Structure

```
solana-stablecoin-standard/
  programs/
    sss-core/              # Core stablecoin program (Anchor)
    sss-transfer-hook/     # Transfer hook program (Anchor)
  sdk/                     # TypeScript SDK (@stbr/sss-token)
  cli/                     # Rust CLI (sss-token)
  backend/                 # Express REST API
  tui/                     # ratatui terminal UI
  frontend/                # Next.js 15 frontend
  tests/                   # Integration tests (97 tests)
  trident-tests/           # Property-based fuzz tests (proptest)
  scripts/                 # Utility scripts
  deployments/             # Deployment artifacts
  docs/                    # Documentation
```

## Program IDs

| Program | Address |
|---|---|
| sss-core | `Corep3pXJzUGaqpw2xzWQi4q63cn1STABiCDMJhMECB` |
| sss-transfer-hook | `hookXMsC9txN6T8hyS9GCyubBL4nvp9XPWg5wW3z3pH` |

## Documentation

| Document | Description |
|---|---|
| [Architecture](docs/ARCHITECTURE.md) | System design, PDA derivation, data flows |
| [SDK Reference](docs/SDK.md) | TypeScript SDK usage and API |
| [CLI Reference](docs/CLI.md) | Command-line tool reference |
| [API Reference](docs/API.md) | Backend REST API endpoints |
| [SSS-1 Spec](docs/SSS-1.md) | Minimal preset specification |
| [SSS-2 Spec](docs/SSS-2.md) | Compliant preset specification |
| [SSS-3 Spec](docs/SSS-3.md) | Private preset specification |
| [Operations](docs/OPERATIONS.md) | Operator runbook and procedures |
| [Security](docs/SECURITY.md) | Threat model and access control |
| [Compliance](docs/COMPLIANCE.md) | Regulatory considerations |

## Testing

The project includes comprehensive test coverage across multiple layers:

- **97 integration tests** -- Full program interaction tests covering SSS-1, SSS-2, SSS-3 presets, role management, security boundaries, oracle supply caps, transfer authority, and edge cases
- **31 SDK unit tests** -- PDA derivation, error mapping, type validation
- **10 property-based fuzz tests** -- Proptest-powered invariant testing (arithmetic overflow, supply cap consistency, role escalation, pause bypass)
- **Rust unit tests** -- Config logic (supply cap, mint validation)

## Known Limitations

### SSS-2: Seize operation not supported

The `seize` instruction uses Token-2022's `TransferChecked` CPI with the config PDA as permanent delegate. On SSS-2 mints, the transfer hook requires extra accounts (blacklist PDA, hook program) that cannot be forwarded through the `TransferChecked` CPI. This is a Token-2022 design constraint — transfer hooks and permanent delegate CPIs are not composable in the current runtime.

**Workaround:** For SSS-2 compliance scenarios requiring asset seizure, use a freeze + admin-coordinated manual transfer flow.

**Affects:** SSS-2 preset only. SSS-1 and SSS-3 seize works correctly.

### Admin role revocation

The `LastAdmin` protection prevents an admin from revoking their own admin role (which would permanently brick the config). However, Admin A can revoke Admin B's admin role even if B is the only other admin. This is by design — counting total admins on-chain would require an additional counter or enumeration mechanism, adding complexity and cost. The recommended pattern is: always maintain 2+ admins, and use a multisig for the primary admin key.

## License

MIT -- see [LICENSE](LICENSE).
