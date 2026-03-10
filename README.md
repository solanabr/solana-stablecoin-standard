# Solana Stablecoin Standard (SSS)

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

The Solana Stablecoin Standard (SSS) is a modular stablecoin SDK with standardized presets for Solana using Token-2022 extensions. It provides two deployment configurations — SSS-1 (Minimal) and SSS-2 (Compliant) — implemented as a single on-chain program with a companion transfer hook program, a fully typed TypeScript SDK, and a CLI, enabling stablecoin issuers to deploy production-ready tokens without writing custom smart contract logic. The standard is inspired by Circle's FiatToken v2 and the Solana Vault Standard (SVS).

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        On-Chain Programs                        │
│                                                                 │
│   ┌────────────────────────┐   ┌────────────────────────────┐  │
│   │       sss-core         │   │        sss-hook            │  │
│   │  (SSS-1 + SSS-2 logic) │◄──│  (Transfer hook / SSS-2)   │  │
│   │  CZzvCtyZ...           │   │  9aw7Ac4a...               │  │
│   └────────────────────────┘   └────────────────────────────┘  │
│              │                              │                   │
│         Token-2022 extensions          Blacklist PDAs          │
└──────────────┼──────────────────────────────┼───────────────────┘
               │                              │
┌──────────────▼──────────────────────────────▼───────────────────┐
│                        TypeScript SDK                           │
│                                                                 │
│   StablecoinClient          ComplianceClient (extends above)    │
│   (SSS-1 + SSS-2 core ops)  (SSS-2 hook + blacklist ops)       │
│                                                                 │
│   PDA helpers   ·   Type definitions   ·   IDL bindings         │
└──────────────────────────────┬──────────────────────────────────┘
                               │
               ┌───────────────▼───────────────┐
               │            CLI                │
               │        (sss-token)            │
               │  init · mint · burn · freeze  │
               │  pause · minter · blacklist   │
               │  roles · info                 │
               └───────────────────────────────┘
```

## Quick Start

**Prerequisites:** Rust, Solana CLI 2.3.0, Anchor 0.32.1, Node.js, Yarn.

```bash
# Install dependencies
yarn install
cd sdk && yarn install && cd ..

# Build on-chain programs
anchor build

# Run the full test suite (61 tests)
anchor test

# Build the SDK and CLI
cd sdk && yarn build && cd ..

# Deploy to devnet
anchor deploy --provider.cluster devnet
```

## Preset Comparison

| Feature | SSS-1 Minimal | SSS-2 Compliant |
|---|---|---|
| Mint / burn | Yes | Yes |
| Freeze / thaw accounts | Yes | Yes |
| Pause all operations | Yes | Yes |
| Role-based access control | Yes | Yes |
| Two-step authority transfer | Yes | Yes |
| On-chain token metadata | Yes | Yes |
| Blacklist (transfer block) | No | Yes |
| Seize tokens (clawback) | No | Yes |
| Default frozen (KYC gate) | No | Yes |
| Transfer hook enforcement | No | Yes |

## Token-2022 Extensions per Preset

| Extension | SSS-1 | SSS-2 | Purpose |
|---|---|---|---|
| MetadataPointer | Yes | Yes | Points mint to its own on-chain metadata |
| MintCloseAuthority | Yes | Yes | Allows closing the mint when supply is zero |
| PermanentDelegate | No | Yes | Enables seize / clawback via the mint authority PDA |
| TransferHook | No | Yes | Enforces pause and blacklist checks on every transfer |
| DefaultAccountState | No | Yes | New token accounts start frozen; require explicit thaw (KYC gate) |

## Role Model

| Role | Assigned To | Capabilities |
|---|---|---|
| `authority` | Issuer admin | Update all roles, seize tokens (SSS-2), initiate authority transfer |
| `master_minter` | Treasury operations | Configure and remove minters, set quotas |
| `pauser` | Risk operations | Pause and unpause all token operations |
| `blacklister` | Compliance | Add/remove wallets from the blacklist (SSS-2), freeze/thaw accounts |

All roles default to the `authority` address at initialization and can be delegated independently. Only `authority` itself requires the two-step transfer process.

## SDK Usage

Install the SDK:

```bash
yarn add @sss/sdk
# or: npm install @sss/sdk
```

**Initialize an SSS-1 stablecoin:**

```typescript
import { StablecoinClient, PRESET_MINIMAL } from "@sss/sdk";
import { Connection } from "@solana/web3.js";

const client = new StablecoinClient(connection, wallet);

const { mint, config, txSig } = await client.initialize({
  preset: PRESET_MINIMAL,
  name: "My USD",
  symbol: "MUSD",
  uri: "https://example.com/musd.json",
  decimals: 6,
});
```

**Configure a minter and mint tokens:**

```typescript
import { BN } from "@coral-xyz/anchor";

// Grant a minter up to 1,000,000 MUSD (in base units)
await client.configureMinter(mint, minterWallet, new BN(1_000_000_000_000));

// Mint 100 MUSD to a destination account
await client.mint(mint, destinationTokenAccount, new BN(100_000_000));
```

**Burn tokens:**

```typescript
await client.burn(mint, new BN(50_000_000));
```

**Blacklist management (SSS-2):**

```typescript
import { ComplianceClient, PRESET_COMPLIANT } from "@sss/sdk";

const compliance = new ComplianceClient(connection, wallet);

// Initialize the hook (call once after SSS-2 initialize)
await compliance.initializeHook(mint);

// Add a wallet to the blacklist
await compliance.addToBlacklist(mint, suspectWallet, "AML violation");

// Check status
const isBlocked = await compliance.isBlacklisted(mint, suspectWallet);
```

## CLI Usage

```bash
# Build and link the CLI
cd sdk && yarn build && npm link

# Initialize an SSS-1 stablecoin
sss-token init \
  --preset 1 \
  --name "My USD" \
  --symbol "MUSD" \
  --decimals 6 \
  --url https://api.devnet.solana.com

# Initialize an SSS-2 stablecoin (requires hook program)
sss-token init \
  --preset 2 \
  --name "Compliant USD" \
  --symbol "CUSD" \
  --hook-program 9aw7Ac4aGMMfND3BvYgGEcASuvyJiBXnQizbhNBphcNM

# Configure a minter
sss-token minter configure \
  --mint <MINT_ADDRESS> \
  --minter <MINTER_WALLET> \
  --quota 1000000000000

# Mint tokens
sss-token mint \
  --mint <MINT_ADDRESS> \
  --destination <TOKEN_ACCOUNT> \
  --amount 100000000

# Pause operations
sss-token pause --mint <MINT_ADDRESS>

# Blacklist a wallet (SSS-2)
sss-token blacklist add \
  --mint <MINT_ADDRESS> \
  --wallet <WALLET_ADDRESS> \
  --reason "Sanctions match"

# Update a role
sss-token roles update \
  --mint <MINT_ADDRESS> \
  --role Pauser \
  --address <NEW_PAUSER>

# Transfer authority (two-step)
sss-token roles transfer-authority \
  --mint <MINT_ADDRESS> \
  --new-authority <NEW_AUTHORITY>

# New authority accepts
sss-token roles accept-authority --mint <MINT_ADDRESS>

# Show stablecoin info
sss-token info config --mint <MINT_ADDRESS>
```

Global options available on all commands: `--keypair`, `--url`, `--output [table|json|csv]`, `--yes`, `--dry-run`.

## Project Structure

```
solana-stablecoin-standard/
├── programs/
│   ├── sss-core/          # Core program (SSS-1 + SSS-2 instructions)
│   │   └── src/
│   │       ├── lib.rs
│   │       ├── state.rs   # StablecoinConfig, MinterState
│   │       ├── error.rs
│   │       ├── events.rs
│   │       ├── constants.rs
│   │       └── instructions/
│   └── sss-hook/          # Transfer hook program (SSS-2)
│       └── src/
│           ├── lib.rs
│           ├── state.rs   # HookConfig, BlacklistEntry
│           └── instructions/
├── modules/
│   └── sss-events/        # Shared event definitions (Anchor events)
├── sdk/
│   └── src/
│       ├── client.ts      # StablecoinClient
│       ├── compliance.ts  # ComplianceClient (extends StablecoinClient)
│       ├── pda.ts         # PDA derivation helpers
│       ├── types.ts       # TypeScript type definitions
│       ├── constants.ts   # Program IDs, seeds, preset constants
│       ├── index.ts       # Public exports
│       └── cli/           # sss-token CLI
│           ├── index.ts
│           ├── utils.ts
│           └── commands/
├── tests/
│   ├── sss-1.ts           # SSS-1 integration tests
│   ├── sss-2.ts           # SSS-2 integration tests
│   ├── access-control.ts  # Role-based access control tests
│   └── helpers.ts         # Shared test utilities
├── backend/               # Reference implementation (REST API, indexer, webhooks)
│   └── src/
├── docs/                  # Architecture, SDK, operations, compliance docs
├── Anchor.toml
├── Cargo.toml
└── package.json
```

## Testing

The test suite contains 61 integration tests covering both presets, all instructions, access control, transfer hook enforcement, and edge cases. Tests run against a local validator using Anchor's test harness.

```bash
# Run all tests
anchor test

# Run a specific test file
yarn run ts-mocha -p tsconfig.json -t 1000000 tests/sss-1.ts
yarn run ts-mocha -p tsconfig.json -t 1000000 tests/sss-2.ts
yarn run ts-mocha -p tsconfig.json -t 1000000 tests/access-control.ts
```

## Devnet Deployment

Both programs are deployed and verified on Solana Devnet:

| Program | Address | Explorer |
|---|---|---|
| sss-core | `CZzvCtyZC8KR37DNDeGYpwN46YEc7WEh6RyeSRdhjY4Y` | [View on Solana Explorer](https://explorer.solana.com/address/CZzvCtyZC8KR37DNDeGYpwN46YEc7WEh6RyeSRdhjY4Y?cluster=devnet) |
| sss-hook | `9aw7Ac4aGMMfND3BvYgGEcASuvyJiBXnQizbhNBphcNM` | [View on Solana Explorer](https://explorer.solana.com/address/9aw7Ac4aGMMfND3BvYgGEcASuvyJiBXnQizbhNBphcNM?cluster=devnet) |

**Deployment transactions:**
- sss-core: [`3P3LRqpJSus2p9Ls9SuZe9fhJp4Rxc8YNQWHTnajRhQoqcbftKcdyq2mtjn6ow9fsVcS2z51EUu8XtmbQ94S4VtW`](https://explorer.solana.com/tx/3P3LRqpJSus2p9Ls9SuZe9fhJp4Rxc8YNQWHTnajRhQoqcbftKcdyq2mtjn6ow9fsVcS2z51EUu8XtmbQ94S4VtW?cluster=devnet)
- sss-hook: [`4eD6WaU5UXhz8oTmQLPymXZpWBSQe9BLbxwsyVMAMFNuuuz37GckcTgEXJsshC8ztarA57AmrXe1Ekf7WA7QyX65`](https://explorer.solana.com/tx/4eD6WaU5UXhz8oTmQLPymXZpWBSQe9BLbxwsyVMAMFNuuuz37GckcTgEXJsshC8ztarA57AmrXe1Ekf7WA7QyX65?cluster=devnet)

IDL accounts are published on-chain for both programs, enabling automatic client generation.

## Security Considerations

- **PDA authority model:** The mint authority (also freeze authority and permanent delegate for SSS-2) is a program-derived address. No private key holder can directly control token operations; all authority flows through the program's instruction logic.
- **Two-step authority transfer:** Changing the `authority` role requires the new authority to explicitly accept the transfer, preventing accidental or malicious transfers to unreachable addresses.
- **Minter quota enforcement:** Each minter has an immutable lifetime quota. Minting decrements the remaining allowance; burning does not restore it. Quotas can only be adjusted by the `master_minter`.
- **Overflow protection:** All arithmetic operations use checked math. The release profile enables overflow checks at the Rust level.
- **Transfer hook integrity:** The hook verifies `TransferHookAccount.transferring` is set before processing, preventing direct invocation of the hook instruction outside of a genuine token transfer.
- **Pause bypass:** Freeze and thaw instructions bypass the pause check intentionally, allowing compliance actions even during an emergency pause.

## License

MIT. See [LICENSE](LICENSE).

## Documentation

Detailed documentation is available in the [docs/](docs/) directory:

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — System design, program internals, PDA derivation, account schemas
- [docs/SDK.md](docs/SDK.md) — Full SDK API reference and usage examples
- [docs/OPERATIONS.md](docs/OPERATIONS.md) — Operator runbook: deployment, minter management, emergency procedures
- [docs/SSS-1.md](docs/SSS-1.md) — SSS-1 Minimal preset specification
- [docs/SSS-2.md](docs/SSS-2.md) — SSS-2 Compliant preset specification
- [docs/COMPLIANCE.md](docs/COMPLIANCE.md) — Regulatory considerations, audit trail format, compliance procedures
- [docs/API.md](docs/API.md) — Backend reference implementation: REST API, webhook payloads, Docker deployment
