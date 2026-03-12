# Solana Stablecoin Standard (SSS)

A modular, compliance-ready stablecoin framework for Solana using Token-2022.

SSS provides a complete on-chain toolkit for issuing and managing stablecoins, from minimal single-authority tokens to fully compliant assets with transfer restrictions, blacklists, asset seizure, and GENIUS Act reserve attestations. The framework ships as two Anchor programs, a TypeScript SDK, a Rust CLI, and a Node.js interactive TUI dashboard.

<p align="center">
  <img src="demo.gif" alt="SSS Admin TUI Demo" width="720" />
</p>

---

## Architecture

SSS is composed of two on-chain Anchor programs that work together:

| Program | Program ID | Purpose |
|---------|-----------|---------|
| **sss-token** | [`5ZBiFxX4ggWfNR5VhAQDRZauG6CvG84puS4SQiH8BcL4`](https://explorer.solana.com/address/5ZBiFxX4ggWfNR5VhAQDRZauG6CvG84puS4SQiH8BcL4?cluster=devnet) | Core stablecoin logic: mint, burn, freeze, thaw, pause, blacklist, seize, reserve attestation, role management |
| **sss-transfer-hook** | [`FmujD82V5FB6Nus7mbEV2a7cp5HG32gsiHykmtNSRJxy`](https://explorer.solana.com/address/FmujD82V5FB6Nus7mbEV2a7cp5HG32gsiHykmtNSRJxy?cluster=devnet) | Transfer hook program invoked by Token-2022 on every transfer to enforce blacklist restrictions (SSS-2 only) |

Both programs are built on **Solana Token-2022** extensions and use PDA-based state management with role-based access control.

## Presets

SSS defines three built-in presets and a custom mode. Each preset activates a specific combination of Token-2022 extensions and program features.

| Preset | Description | Token-2022 Extensions |
|--------|-------------|----------------------|
| **SSS-1 (Minimal)** | Basic stablecoin with mint/burn/freeze/thaw/pause. Suitable for internal or low-regulation environments. | MetadataPointer |
| **SSS-2 (Compliant)** | Full compliance suite with permanent delegate, transfer hook, blacklist, and asset seizure. Designed for regulated stablecoin issuers. | MetadataPointer, PermanentDelegate, TransferHook, DefaultAccountState |
| **SSS-3 (Private)** | Privacy-preserving stablecoin with confidential transfers. For use cases requiring transaction privacy with regulatory oversight. | MetadataPointer, PermanentDelegate, ConfidentialTransferMint |
| **Custom** | User-defined combination of feature flags. | Varies |

For a detailed comparison, see [docs/presets.md](docs/presets.md).

## Quick Start

### Prerequisites

- Rust 1.75+ with Cargo
- Solana CLI 2.x (Agave)
- Anchor 0.31.1
- Node.js 18+

### Build

```bash
anchor build
```

If the build fails with a `blake3` edition2024 parse error, pin the dependency:

```bash
cargo update -p blake3 --precise 1.5.5
anchor build
```

### Test

```bash
anchor test
```

The test suite runs 60 integration tests across all presets plus SDK integration and 69 fuzz/property tests.

| Suite | Tests | Coverage |
|-------|-------|----------|
| SSS-1 | 16 | init, minter, mint, burn, freeze, thaw, pause, unpause, feature-gate, quota, roles, **unauthorized access (4 tests)** |
| SSS-2 | 12 | init with hook, ExtraAccountMetaList, mint, blacklist, seize, pause, attestation, **transfer hook execution (4 tests)** |
| SSS-3 | 9 | init with confidential transfers, mint, burn, freeze, thaw, pause, blacklist, roles |
| SDK Integration | 23 | Client construction, PDA derivation, all instructions, error handling |
| Fuzz / Property | 69 | Validation boundaries, overflow protection, RBAC, proptest generative |

### Backend (Docker)

```bash
# Set your API key for authenticated endpoints
export API_KEY=your-secret-key

# Build and start all 4 services
docker compose up --build
```

This spins up:

| Service | Port | Description |
|---------|------|-------------|
| `sss-api` | 3000 | REST API for all stablecoin operations |
| `sss-webhook-service` | 3001 | Event dispatch with retry |
| `sss-compliance-service` | 3002 | Sanctions screening |
| `sss-event-listener` | -- | On-chain log subscriber |

All POST endpoints require `Authorization: Bearer <API_KEY>` header. GET endpoints are public.

### Build the CLI

```bash
cargo build -p sss-cli
```

The binary is output to `target/debug/sss` (or `target/release/sss` with `--release`).

## Project Structure

```
programs/
  sss-token/          # Core program — 14 instructions, 5 account types, 25 error codes
  sss-transfer-hook/  # Transfer hook — blacklist enforcement on every transfer (SSS-2)
sdk/                  # TypeScript SDK — SSSClient, PDA helpers, oracle module, presets
cli/                  # Rust CLI — 14 subcommands with formatted terminal output
tui/                  # Node.js TUI — interactive admin dashboard (blessed/blessed-contrib)
app/                  # Next.js frontend — landing page + wallet-connected dashboard
backend/              # Express.js REST API wrapping the SDK
tests/                # Anchor integration + E2E devnet tests
docs/                 # Architecture, presets, compliance, operations docs
```

## Features

### On-Chain Program (14 Instructions)

- **initialize** -- Create a new stablecoin mint with Token-2022 extensions, config PDA, and role registry
- **mint_tokens** -- Mint tokens to a recipient (requires active minter with sufficient quota)
- **burn_tokens** -- Burn tokens from the caller's token account
- **freeze_account** -- Freeze a token account (master authority or pauser)
- **thaw_account** -- Thaw a frozen token account
- **pause** -- Pause all minting and burning operations globally
- **unpause** -- Resume operations after a pause
- **update_roles** -- Assign or reassign pauser, blacklister, and seizer roles
- **update_minter** -- Create or update a minter with active status and mint quota
- **transfer_authority** -- Transfer master authority to a new address
- **blacklist_add** -- Add an address to the blacklist and freeze their token account (SSS-2)
- **blacklist_remove** -- Remove an address from the blacklist and thaw their token account (SSS-2)
- **seize** -- Seize tokens from a blacklisted address via burn+mint (SSS-2)
- **attest_reserve** -- Record an on-chain reserve attestation with hash, amounts, and URI (GENIUS Act)

### Role-Based Access Control

| Role | Capabilities |
|------|-------------|
| **Master Authority** | All operations, role assignment, authority transfer |
| **Pauser** | Pause and unpause the program |
| **Blacklister** | Add and remove blacklist entries (SSS-2) |
| **Seizer** | Seize tokens from blacklisted addresses (SSS-2) |
| **Minter** | Mint tokens up to assigned quota |

### GENIUS Act Compliance

On-chain reserve attestations store a SHA-256 hash of off-chain reserve proof data, total reserves in USD, total outstanding tokens, the attester's public key, and a URI pointing to the full audit report. Each attestation is indexed and immutable once recorded.

### Oracle Integration

The SDK includes an `OracleModule` for fetching real-time price data from Pyth price feeds, computing reserve hashes, and building attestation data structures.

### Interactive TUI Dashboard

The project includes an interactive Node.js terminal dashboard (powered by blessed/blessed-contrib) that displays live stablecoin configuration, supply metrics, role assignments, minter status, and lets operators execute all program operations directly from the terminal.

```bash
cd tui && npm install && node admin_tui.js --rpc https://api.devnet.solana.com --mint <MINT_ADDRESS> --keypair <PATH>
```

## SDK

The TypeScript SDK provides a high-level `SSSClient` for interacting with both programs.

```bash
npm install solana-stablecoin-standard
```

See [sdk/README.md](sdk/README.md) for the full API reference.

## CLI

The Rust CLI (`sss`) provides all program operations as subcommands with formatted terminal output.

```bash
cargo install --path cli
sss --help
```

See [cli/README.md](cli/README.md) for the complete command reference.

## Documentation

**Live docs: [docs.stablecoinstandard.dev](https://docs.stablecoinstandard.dev)**

- [Architecture](docs/architecture.md) -- PDA schema, Token-2022 extensions, transfer hook flow, role model
- [Presets](docs/presets.md) -- Feature comparison matrix and use cases
- [SSS-1 Specification](docs/SSS-1.md) -- Minimal stablecoin preset details
- [SSS-2 Specification](docs/SSS-2.md) -- Compliant stablecoin preset with transfer hook
- [SSS-3 Specification](docs/SSS-3.md) -- Private stablecoin preset with confidential transfers
- [Compliance](docs/COMPLIANCE.md) -- GENIUS Act mapping, OFAC screening, regulatory considerations
- [Operations](docs/OPERATIONS.md) -- Operator runbook: deployment, monitoring, incident response
- [API Reference](docs/API.md) -- Backend REST API endpoint documentation

## Devnet Deployment

Both programs are deployed to Solana devnet:

| Program | Program ID | Explorer |
|---------|-----------|----------|
| **sss-token** | `5ZBiFxX4ggWfNR5VhAQDRZauG6CvG84puS4SQiH8BcL4` | [View on Explorer](https://explorer.solana.com/address/5ZBiFxX4ggWfNR5VhAQDRZauG6CvG84puS4SQiH8BcL4?cluster=devnet) |
| **sss-transfer-hook** | `FmujD82V5FB6Nus7mbEV2a7cp5HG32gsiHykmtNSRJxy` | [View on Explorer](https://explorer.solana.com/address/FmujD82V5FB6Nus7mbEV2a7cp5HG32gsiHykmtNSRJxy?cluster=devnet) |

### Deploy to Devnet

```bash
./scripts/deploy-devnet.sh
```

The deploy script will:
1. Configure Solana CLI for devnet
2. Build programs if needed
3. Deploy both programs
4. Run example transactions (init SSS-1, add minter, mint tokens)

### Example Devnet Transactions

| Action | Signature |
|--------|-----------|
| Deploy sss-token | [`4Qo6Uq...u7rNHh`](https://explorer.solana.com/tx/4Qo6UqzYjFXgTK5e834vzSQtgJBrubiWgNqhFpbWjQMWn9TG7uMMeTMf1Lv3C76fxoWEzLZTP9iDDUDjsLu7rNHh?cluster=devnet) |
| Deploy sss-transfer-hook | [`3tL27q...hPBYn`](https://explorer.solana.com/tx/3tL27qMEeiGRfH7NGzhkfDtBoyBi32gXMFqjob7pN1JG2sSioQVf87WQnQUAHQCUZpisNkg9oVkRqt1fn5qhPBYn?cluster=devnet) |
| Init SSS-1 (DevnetUSD) | [`24fcq8...4AtyF`](https://explorer.solana.com/tx/24fcq83aVQNuvEeMf7P6HuPcPhb8YhNbYeDdHhCdUKBKrapRkfwL8G9qQuR5Dmm9MTJJx2n8thWdfKEjVoq4AtyF?cluster=devnet) |

**Example Mint:** [`9MmnDN61FaYd7SRzsnHmwEMj1jbTWh1XD4xaM9nWYujv`](https://explorer.solana.com/address/9MmnDN61FaYd7SRzsnHmwEMj1jbTWh1XD4xaM9nWYujv?cluster=devnet)

### Live Demo: Full SSS-2 Workflow

Every operation executed end-to-end on Solana devnet against a single SSS-2 mint. Click any signature to verify on Solana Explorer.

**Mint:** [`C9TssJentaYfyyfbhihHRGfxS5t3aWHS8LoXJbopyLgp`](https://explorer.solana.com/address/C9TssJentaYfyyfbhihHRGfxS5t3aWHS8LoXJbopyLgp?cluster=devnet)

| # | Operation | Description | Transaction |
|---|-----------|-------------|-------------|
| 1 | **Initialize SSS-2** | Create mint with MetadataPointer + PermanentDelegate + TransferHook + DefaultAccountState | [`2Cueq6...cZF9`](https://explorer.solana.com/tx/2Cueq6MC4JzDczrcGXXmgyYAfVUU832RzYUMqfnYygJNp6imRxQw712xmz61YB8EKLhbeGQT2VrvFXDNSt9jcZF9?cluster=devnet) |
| 2 | **Init Transfer Hook** | Initialize ExtraAccountMetaList for blacklist enforcement | [`3VRxTx...NCfr`](https://explorer.solana.com/tx/3VRxTxjwdk4eCUyzqT2dcoWsa2DwsNvSXbr2khg4PKf9b5BX15jxSCdiwAexVqH4TQBqygy1ovFV7myzTvNHNCfr?cluster=devnet) |
| 3 | **Register Minter** | Add minter with 1,000,000 token quota | [`5rLcNs...ipSF`](https://explorer.solana.com/tx/5rLcNs7G2aQqaJ6hBJDnzkMwXAenHeSLLvF49tQ2ZoaRxdRz6vNBaQNLEoQgEPCqLdrgePQ7jmnhMGKJuaw6ipSF?cluster=devnet) |
| 4 | **Mint 1,000 Tokens** | Mint tokens to recipient (auto-creates ATA) | [`2hpwXK...mSt2`](https://explorer.solana.com/tx/2hpwXKWK2wQe5E7LtYTS4ToXijmiPLNsjTvRzXoNyfQ1etYLQzxjTKUDjN5wvE8hcfRrAoKFFFEUUv6vJUbAmSt2?cluster=devnet) |
| 5 | **Burn 100 Tokens** | Burn tokens from caller's account | [`rNNVwW...YJfy`](https://explorer.solana.com/tx/rNNVwWtsPvprVBScTLWk5zZf7BF22PVXoPMryMcGt6CdtFgpSZDxrtXysn9gQCL6AxFAywMTjGqRkrzrgkWYJfy?cluster=devnet) |
| 6 | **Freeze Account** | Freeze a token account | [`2fRzw6...QEPB`](https://explorer.solana.com/tx/2fRzw6SPj9TcEPsAiKXSjLSpagFTkrxK2cgAW3VLh1o7VDmr344c3rZDXN5vonELXqyCvj6UuXcd8nLTMT2xQEPB?cluster=devnet) |
| 7 | **Thaw Account** | Thaw a frozen token account | [`3hdai9...M6yw`](https://explorer.solana.com/tx/3hdai9dLYouDEV4dfDg3d1MWZ7QQBjSmuXZyWnK6WUwGh5UNdPy686HbSbYVQjpKYHpqgcaYYf8dpXALrsFzM6yw?cluster=devnet) |
| 8 | **Pause** | Pause all minting and burning globally | [`TwZZCx...hVjR`](https://explorer.solana.com/tx/TwZZCx4nhi6rxAF1QEzmqzf2pNn1Re1bzz89R43fyAshZEpBqR33AXXbdAevs4p8tcbwwFszGUPqqo6zYc3hVjR?cluster=devnet) |
| 9 | **Unpause** | Resume operations | [`5W9gyY...tQrM`](https://explorer.solana.com/tx/5W9gyYRw9fZvsXGE7CBsLqHR25CeQvrp5PveWyNfkXN5DEHVW3bJop5Z13vTTKQViafn4hCmXzNW6hkSoMyBtQrM?cluster=devnet) |
| 10 | **Assign Roles** | Set pauser, blacklister, and seizer roles | [`5w3Qeg...kf4D`](https://explorer.solana.com/tx/5w3QegM657D5hHAkhe8ccfB4FoyatDLrYgUjYAC9ze2aB28NNuegBo5dU9txMGWcE9LjbYVDMzsCQHf9XGUjkf4D?cluster=devnet) |
| 11 | **Blacklist Add** | Add address to blacklist + freeze their account | [`2AQcWo...czVe`](https://explorer.solana.com/tx/2AQcWo6cg4HNLreSZmLW7KvRvgRB39Bcy1WYBkTxqmSk6W12ZGVXKyT7bXSqcwBVcXDF7DtjnNNzVT46NGvUczVe?cluster=devnet) |
| 12 | **Seize Tokens** | Seize tokens from blacklisted address via burn+mint | [`CHWrRL...v3P`](https://explorer.solana.com/tx/CHWrRLUhhZhxvDg5rgrHgRtACKjqjG3wKcfN4h3M4khUs5q6HpmZFWcqBCn33qpfgi96mUn7KRsJd3SYWZsvu3P?cluster=devnet) |
| 13 | **Blacklist Remove** | Remove address from blacklist + thaw their account | [`5mq1c8...EoKS`](https://explorer.solana.com/tx/5mq1c8icf3Xf6W8ynLSPUroLqj2fxB6UqF4WmZf43kDBpZLpV3tzWYRkUGYuc8M3kTjP1Y4jforNwgrSQxToEoKS?cluster=devnet) |
| 14 | **Attest Reserve** | Record on-chain reserve attestation (GENIUS Act) | [`h3X8T9...jBM`](https://explorer.solana.com/tx/h3X8T9F1j2437izqGv3tnJds7qJZr5K9VW9QuXD5Jdor8AsAezwCifJc7tGYAcGroy8QJFbymUdix4WHxDrcjBM?cluster=devnet) |

> All 14 operations executed successfully on devnet in a single automated E2E run.

### Example CLI Usage (Devnet)

```bash
# Initialize a stablecoin
sss --url https://api.devnet.solana.com init --preset sss-1 --name "DevnetUSD" --symbol "dUSD"

# Check status
sss --url https://api.devnet.solana.com status --mint 9MmnDN61FaYd7SRzsnHmwEMj1jbTWh1XD4xaM9nWYujv

# View supply
sss --url https://api.devnet.solana.com supply --mint 9MmnDN61FaYd7SRzsnHmwEMj1jbTWh1XD4xaM9nWYujv

# Launch TUI dashboard
sss --url https://api.devnet.solana.com dashboard --mint 9MmnDN61FaYd7SRzsnHmwEMj1jbTWh1XD4xaM9nWYujv
```

## Build Notes

- **blake3 pinning**: Platform tools ship Cargo 1.84 which cannot parse `edition = "2024"` in blake3 >= 1.6. Pin to 1.5.5 with `cargo update -p blake3 --precise 1.5.5`.
- **Feature name**: The Token-2022 feature is `token_2022` (underscore), not `token-2022` (hyphen).
- **Anchor version**: 0.31.1. The `init-if-needed` feature is required in `anchor-lang` for the `UpdateMinter` instruction.
- **Seize mechanism**: Seize uses burn+mint (not `transfer_checked`) to bypass the transfer hook for privileged operations.

## License

MIT
