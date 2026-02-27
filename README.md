# Solana Stablecoin Standard (SSS)

A modular, compliance-ready stablecoin framework for Solana using Token-2022.

SSS provides a complete on-chain toolkit for issuing and managing stablecoins, from minimal single-authority tokens to fully compliant assets with transfer restrictions, blacklists, asset seizure, and GENIUS Act reserve attestations. The framework ships as two Anchor programs, a TypeScript SDK, and a Rust CLI with an interactive TUI dashboard.

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

### Build the CLI

```bash
cargo build -p sss-cli
```

The binary is output to `target/debug/sss` (or `target/release/sss` with `--release`).

## Project Structure

```
solana-stablecoin-standard/
  programs/
    sss-token/                 # Core stablecoin program
      src/
        instructions/          # 14 instruction handlers
          initialize.rs        # Create mint + config + roles
          mint.rs              # Mint tokens (minter role)
          burn.rs              # Burn tokens
          freeze.rs            # Freeze a token account
          thaw.rs              # Thaw a token account
          pause.rs             # Pause all operations
          unpause.rs           # Resume operations
          update_roles.rs      # Assign pauser/blacklister/seizer
          update_minter.rs     # Configure minter wallets + quotas
          transfer_authority.rs# Transfer master authority
          blacklist_add.rs     # Add address to blacklist (SSS-2)
          blacklist_remove.rs  # Remove address from blacklist (SSS-2)
          seize.rs             # Seize tokens from blacklisted address (SSS-2)
          attest_reserve.rs    # Record reserve attestation (GENIUS Act)
        state/                 # Account structures
          config.rs            # StablecoinConfig
          roles.rs             # RoleRegistry
          minter.rs            # MinterInfo
          blacklist.rs         # BlacklistEntry
          reserve.rs           # ReserveAttestation
          audit.rs             # AuditLogEntry
        utils/                 # Access control + feature gating
        errors.rs              # Error codes (25 variants)
        events.rs              # Anchor events (14 event types)
        lib.rs                 # Program entry point
    sss-transfer-hook/         # Transfer hook program (SSS-2)
      src/
        lib.rs                 # Hook execute + ExtraAccountMetaList init
  sdk/                         # TypeScript SDK
    src/
      client.ts                # SSSClient class
      pda.ts                   # PDA derivation helpers
      types.ts                 # TypeScript type definitions
      events.ts                # Event parsing utilities
      oracle.ts                # OracleModule (Pyth price feeds)
      presets.ts               # Preset configuration helpers
      errors.ts                # Error mapping + SSSError class
      constants.ts             # Program IDs + PDA seeds
      index.ts                 # Public exports
  cli/                         # Rust CLI
    src/
      main.rs                  # Clap argument parsing + dispatch
      commands/                # Subcommand implementations
      config.rs                # CLI configuration (RPC URL, keypair)
      display.rs               # Formatted terminal output
      pda.rs                   # PDA derivation helpers
      tui.rs                   # Interactive ratatui dashboard
  backend/                     # Backend services
  tests/                       # Anchor integration tests
  docs/                        # Architecture + preset documentation
  Anchor.toml                  # Anchor workspace config
  Cargo.toml                   # Rust workspace config
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

The CLI ships with an interactive terminal dashboard (powered by ratatui) that displays live stablecoin configuration, supply metrics, role assignments, and minter status.

## SDK

The TypeScript SDK provides a high-level `SSSClient` for interacting with both programs.

```bash
npm install @solana-stablecoin-standard/sdk
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

- [Architecture](docs/architecture.md) -- PDA schema, Token-2022 extensions, transfer hook flow, role model
- [Presets](docs/presets.md) -- Feature comparison matrix and use cases
- [SSS-1 Specification](docs/SSS-1.md) -- Minimal stablecoin preset details
- [SSS-2 Specification](docs/SSS-2.md) -- Compliant stablecoin preset with transfer hook
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

| Action | Signature | Explorer |
|--------|-----------|----------|
| Deploy sss-token | `4Qo6UqzYjFXgTK5e834vzSQtgJBrubiWgNqhFpbWjQMWn9TG7uMMeTMf1Lv3C76fxoWEzLZTP9iDDUDjsLu7rNHh` | [View](https://explorer.solana.com/tx/4Qo6UqzYjFXgTK5e834vzSQtgJBrubiWgNqhFpbWjQMWn9TG7uMMeTMf1Lv3C76fxoWEzLZTP9iDDUDjsLu7rNHh?cluster=devnet) |
| Deploy sss-transfer-hook | `3tL27qMEeiGRfH7NGzhkfDtBoyBi32gXMFqjob7pN1JG2sSioQVf87WQnQUAHQCUZpisNkg9oVkRqt1fn5qhPBYn` | [View](https://explorer.solana.com/tx/3tL27qMEeiGRfH7NGzhkfDtBoyBi32gXMFqjob7pN1JG2sSioQVf87WQnQUAHQCUZpisNkg9oVkRqt1fn5qhPBYn?cluster=devnet) |
| Init SSS-1 (DevnetUSD) | `24fcq83aVQNuvEeMf7P6HuPcPhb8YhNbYeDdHhCdUKBKrapRkfwL8G9qQuR5Dmm9MTJJx2n8thWdfKEjVoq4AtyF` | [View](https://explorer.solana.com/tx/24fcq83aVQNuvEeMf7P6HuPcPhb8YhNbYeDdHhCdUKBKrapRkfwL8G9qQuR5Dmm9MTJJx2n8thWdfKEjVoq4AtyF?cluster=devnet) |

**Example Mint:** `9MmnDN61FaYd7SRzsnHmwEMj1jbTWh1XD4xaM9nWYujv` ([View](https://explorer.solana.com/address/9MmnDN61FaYd7SRzsnHmwEMj1jbTWh1XD4xaM9nWYujv?cluster=devnet))

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
