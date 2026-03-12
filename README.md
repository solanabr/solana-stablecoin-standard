# Solana Stablecoin Standard (SSS)

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Anchor](https://img.shields.io/badge/Anchor-0.32.1-blueviolet)](https://www.anchor-lang.com/)
[![Token-2022](https://img.shields.io/badge/Token--2022-Extensions-green)](https://spl.solana.com/token-2022)

A modular stablecoin framework for Solana built on Token-2022 extensions. Three standardized presets — **SSS-1** (Minimal), **SSS-2** (Compliant), and **SSS-3** (Confidential) — deliver production-ready stablecoin infrastructure without writing custom smart contract logic.

Inspired by [Circle's FiatToken v2](https://github.com/circlefin/stablecoin-evm) role model and the [Solana Vault Standard](https://github.com/fragmetric-labs/solana-vault-standard) architecture patterns.

---

## Architecture

```
┌──────────────────────────────────────────────────────────────────────────┐
│                          On-Chain Programs                                │
│                                                                          │
│  ┌──────────────────────────┐      ┌──────────────────────────────────┐  │
│  │        sss-core           │      │          sss-hook                │  │
│  │  SSS-1 + SSS-2 + SSS-3   │◄─────│  Transfer hook (SSS-2/SSS-3)    │  │
│  │  1,630 lines · 15 ix     │      │  595 lines · Blacklist + Pause   │  │
│  │  CZzvCtyZ...              │      │  9aw7Ac4a...                    │  │
│  └──────────────────────────┘      └──────────────────────────────────┘  │
│         │                                      │                         │
│    Token-2022 extensions                  Blacklist PDAs                 │
│    ConfidentialTransferMint (SSS-3)       ExtraAccountMetaList          │
└─────────┼──────────────────────────────────────┼─────────────────────────┘
          │                                      │
┌─────────▼──────────────────────────────────────▼─────────────────────────┐
│                          TypeScript SDK                                   │
│                                                                          │
│  SolanaStablecoin (facade)  ·  StablecoinClient  ·  ComplianceClient     │
│  TransactionBuilder         ·  Zod validation    ·  PDA helpers          │
│  2,491 lines across 12 source files                                      │
└──────────────────────────────────┬───────────────────────────────────────┘
                                   │
          ┌────────────────────────┼──────────────────────────┐
          │                        │                          │
┌─────────▼──────────┐  ┌─────────▼──────────┐  ┌───────────▼──────────┐
│     CLI (sss-token) │  │      Backend       │  │   Admin TUI + Web    │
│  14 command groups  │  │  REST API, Indexer  │  │  Blessed TUI         │
│  2,954 lines        │  │  Webhooks, Docker   │  │  Next.js Dashboard   │
│  --dry-run · --json │  │  1,683 lines        │  │  Wallet Adapter      │
└─────────────────────┘  └─────────────────────┘  └──────────────────────┘
```

**Why a single core program?** SSS-1 is a strict subset of SSS-2, which is a strict subset of SSS-3. A `preset` field in the config PDA gates higher-level instructions at runtime — less duplication, fewer bugs, one audit surface.

**Why a separate hook program?** Token-2022 requires transfer hooks to be independently deployed programs. The hook enforces blacklist and pause checks on every `transfer_checked` call.

---

## Preset Comparison

| Feature | SSS-1 Minimal | SSS-2 Compliant | SSS-3 Confidential |
|---|:---:|:---:|:---:|
| Mint / burn with quota enforcement | Yes | Yes | Yes |
| Freeze / thaw accounts | Yes | Yes | Yes |
| Pause all operations | Yes | Yes | Yes |
| Role-based access control (4 roles) | Yes | Yes | Yes |
| Two-step authority transfer | Yes | Yes | Yes |
| On-chain token metadata | Yes | Yes | Yes |
| Transfer hook enforcement | — | Yes | Yes |
| Bidirectional blacklist | — | Yes | Yes |
| Token seizure (clawback) | — | Yes | Yes |
| Default frozen (KYC gate) | — | Yes | Yes |
| Confidential transfers (encrypted amounts) | — | — | Yes |
| Allowlist-based CT approval | — | — | Yes |
| Auditor decryption capability | — | — | Yes |

### Token-2022 Extensions per Preset

| Extension | SSS-1 | SSS-2 | SSS-3 | Purpose |
|---|:---:|:---:|:---:|---|
| MetadataPointer | Yes | Yes | Yes | Points mint to its own on-chain metadata |
| TokenMetadata | Yes | Yes | Yes | Name, symbol, URI stored on the mint account |
| MintCloseAuthority | Yes | Yes | Yes | Close mint when supply reaches zero |
| PermanentDelegate | — | Yes | Yes | Seize/clawback via the mint authority PDA |
| TransferHook | — | Yes | Yes | Enforce pause + blacklist on every transfer |
| DefaultAccountState(Frozen) | — | Yes | Yes | New token accounts start frozen (KYC gate) |
| ConfidentialTransferMint | — | — | Yes | Encrypted transfer amounts with auditor oversight |

---

## Quick Start

**Prerequisites:** Rust 1.79+, Solana CLI 2.3.0, Anchor 0.32.1, Node.js 18+, Yarn.

```bash
# Clone and install
git clone https://github.com/solanabr/solana-stablecoin-standard.git
cd solana-stablecoin-standard
yarn install
cd sdk && yarn install && cd ..

# Build on-chain programs
anchor build

# Run the full test suite (92 integration + 186 SDK + 40 backend = 318 tests)
anchor test           # 92 integration tests
cd sdk && yarn test   # 186 SDK unit tests
cd ../backend && yarn test  # 40 backend tests

# Build the SDK and CLI
cd sdk && yarn build

# Deploy to devnet
anchor deploy --provider.cluster devnet
```

---

## Role Model

Inspired by Circle's FiatToken v2, all roles default to the `authority` at initialization and can be delegated independently.

| Role | Capabilities | Changed By |
|---|---|---|
| **authority** | All admin operations, update all roles, seize tokens (SSS-2+), approve confidential accounts (SSS-3) | Two-step transfer (transfer + accept) |
| **master_minter** | Configure/remove minters, set quotas | authority |
| **pauser** | Pause/unpause all operations | authority |
| **blacklister** | Add/remove wallets from blacklist (SSS-2+), freeze/thaw accounts | authority |

**Minting quota model:** Each minter has an immutable lifetime `quota` and a `minted_amount` counter. Burning does **not** restore quota — only the master minter can adjust it.

**Two-step authority transfer:** `transfer_authority` sets a `pending_authority`, then `accept_authority` completes the handoff. Prevents accidental lockout.

---

## Security Design

Every instruction handler follows a consistent **7-step pattern**: VALIDATE → READ STATE → COMPUTE → SAFETY CHECK → EXECUTE CPI → UPDATE STATE → EMIT EVENT.

| Property | Implementation |
|---|---|
| **Zero `unwrap()` calls** | All error paths use `?` or explicit error handling across both programs |
| **Checked arithmetic everywhere** | `checked_add`, `checked_sub` with `ArithmeticOverflow` error — no silent overflows |
| **PDA authority model** | Mint authority is a program-derived address — no private key holder controls token operations |
| **Bidirectional blacklist** | Transfer hook checks BOTH source and destination owners via dynamic ExtraAccountMeta PDA resolution |
| **Fail-closed pause** | If StablecoinConfig is missing or malformed, the hook blocks transfers (fail-closed, not fail-open) |
| **Anti-manipulation guard** | Hook verifies `TransferHookAccount.transferring` is set, preventing direct invocation outside genuine transfers |
| **Zero-address guards** | `transfer_authority` and `update_role` reject `Pubkey::default()` as an assignment target |
| **Pause bypass for emergencies** | Freeze/thaw bypass the pause check intentionally — compliance actions must work during crises |
| **Config ownership validation** | `InitializeHook` validates the stablecoin config is owned by sss-core with discriminator check |
| **Overflow-checked release builds** | `overflow-checks = true` in Cargo `[profile.release]` |

Full threat model with 9 attack vectors and mitigations: [SECURITY.md](SECURITY.md).

---

## SSS-3: Confidential Transfers

SSS-3 extends SSS-2 with `ConfidentialTransferMint` for encrypted transfer amounts. The key architectural insight: **confidential transfers bypass the transfer hook**, so SSS-3 uses a dual-compliance model:

- **Public transfers** → Transfer hook enforces blacklist + pause (inherited from SSS-2)
- **Confidential transfers** → Allowlist-based approval via the confidential transfer authority (mint authority PDA)

```
┌──────────────┐     Public Transfer      ┌─────────────┐
│  Token-2022  │ ──────────────────────►  │  sss-hook   │  ← Blacklist + Pause check
└──────────────┘                          └─────────────┘

┌──────────────┐   Confidential Transfer   ┌─────────────┐
│  Token-2022  │ ──────────────────────►  │  sss-core   │  ← AllowlistEntry PDA gate
└──────────────┘   (encrypted amounts)     └─────────────┘
```

**On-chain skeleton implemented:**
- `PRESET_CONFIDENTIAL = 3` with `ConfidentialTransferMint` extension initialization
- `AllowlistEntry` PDA account: `["allowlist", mint, wallet]`
- `approve_confidential` instruction: creates AllowlistEntry + CPIs Token-2022 `approve_account` via `invoke_signed`
- `revoke_confidential` instruction: marks AllowlistEntry as revoked
- Events: `ConfidentialAccountApproved`, `ConfidentialAccountRevoked`
- SDK: `findAllowlistEntryPda()`, TransactionBuilder methods, type definitions

Full specification: [docs/SSS-3.md](docs/SSS-3.md).

---

## SDK Usage

### High-Level Facade

```typescript
import { SolanaStablecoin, Presets } from "@sss/sdk";

// Create an SSS-2 compliant stablecoin
const stable = await SolanaStablecoin.create(connection, {
  preset: Presets.SSS_2,
  name: "My USD",
  symbol: "MUSD",
  decimals: 6,
  authority: wallet,
});

// Initialize the compliance hook
await stable.compliance.initializeHook();

// Configure a minter and mint tokens
await stable.configureMinter(minterWallet, new BN(1_000_000));
await stable.mint({ recipient: destinationAta, amount: 100_000 });

// Compliance operations (SSS-2+)
await stable.compliance.blacklistAdd(suspectWallet, "AML violation");
await stable.compliance.seize(frozenAccount, treasuryAta, new BN(50_000));

// Attach to an existing deployment
const existing = await SolanaStablecoin.load(connection, mintAddress, wallet);
```

### Transaction Builder (Batched Operations)

Compose multiple instructions into a single atomic transaction:

```typescript
import { TransactionBuilder } from "@sss/sdk";

const builder = new TransactionBuilder(connection, wallet);

// SSS-1: batch minter setup
const txSig = await builder
  .configureMinter(mint, minterA, new BN(500_000))
  .configureMinter(mint, minterB, new BN(500_000))
  .execute();

// SSS-2: compliance batch
await builder
  .addToBlacklist(mint, suspectWallet, "Sanctions match")
  .freezeAccount(mint, suspectTokenAccount)
  .execute();

// SSS-3: confidential transfer approval
await builder
  .approveConfidential(mint, userWallet, userTokenAccount)
  .execute();
```

### Low-Level Client API

```typescript
import { StablecoinClient, ComplianceClient, PRESET_COMPLIANT } from "@sss/sdk";

const client = new StablecoinClient(connection, wallet);
const { mint, config, txSig } = await client.initialize({
  preset: PRESET_COMPLIANT,
  name: "My USD",
  symbol: "MUSD",
  uri: "https://example.com/musd.json",
  decimals: 6,
});

const compliance = new ComplianceClient(connection, wallet);
await compliance.initializeHook(mint);
await compliance.addToBlacklist(mint, suspectWallet, "AML violation");
```

### Input Validation (Zod)

SDK entry points validate all parameters at the boundary using Zod schemas:

```typescript
import { validateCreateOptions, CreateStablecoinOptionsSchema } from "@sss/sdk";

// Automatic validation on SolanaStablecoin.create() and StablecoinClient.initialize()
// Or validate manually:
validateCreateOptions({ preset: 4, name: "", decimals: 15 });
// → Error: "preset: Invalid input; name: String must contain at least 1 character(s); decimals: Number must be less than or equal to 9"
```

---

## CLI Usage

```bash
# Build and link the CLI
cd sdk && yarn build && npm link

# Initialize an SSS-1 stablecoin
sss-token init --preset 1 --name "My USD" --symbol "MUSD" --decimals 6

# Initialize an SSS-2 stablecoin (requires hook program)
sss-token init --preset 2 --name "Compliant USD" --symbol "CUSD" \
  --hook-program 9aw7Ac4aGMMfND3BvYgGEcASuvyJiBXnQizbhNBphcNM

# Initialize transfer hook
sss-token hook init --mint <MINT_ADDRESS>

# Configure a minter and mint tokens
sss-token minter configure --mint <MINT> --minter <WALLET> --quota 1000000000000
sss-token mint --mint <MINT> --destination <TOKEN_ACCOUNT> --amount 100000000

# Pause / unpause operations
sss-token pause --mint <MINT>
sss-token unpause --mint <MINT>

# Blacklist management (SSS-2+)
sss-token blacklist add --mint <MINT> --wallet <WALLET> --reason "Sanctions match"
sss-token blacklist remove --mint <MINT> --wallet <WALLET>

# Seize tokens (SSS-2+)
sss-token seize 1000000 --mint <MINT> --from <SOURCE> --to <DEST>

# Role management
sss-token roles update --mint <MINT> --role Pauser --address <NEW_PAUSER>
sss-token roles transfer-authority --mint <MINT> --new-authority <NEW>
sss-token roles accept-authority --mint <MINT>

# Query state
sss-token status --mint <MINT>
sss-token info config --mint <MINT>
sss-token minter list --mint <MINT>
sss-token holders --mint <MINT> --top 20
sss-token audit-log --mint <MINT> --limit 50
```

All commands support: `--keypair`, `--url`, `--output [table|json|csv]`, `--yes`, `--dry-run`.

---

## Testing

**318 tests** across three test suites, all passing:

| Suite | Tests | Coverage |
|---|---|---|
| **Integration** (Anchor + local validator) | 92 | Full instruction flows for SSS-1 and SSS-2, access control, edge cases, multi-minter isolation, transfer hook enforcement |
| **SDK Unit** (Mocha) | 186 | Client methods, PDA derivation, type validation, builder chaining, facade API |
| **Backend** (Vitest + supertest) | 40 | Health endpoint, compliance routes, mint/burn routes, webhooks, audit pagination, input validation |

```bash
anchor test                        # 92 integration tests
cd sdk && yarn test                # 186 SDK unit tests
cd backend && yarn test            # 40 backend tests
```

### Integration Test Files

| File | Focus |
|---|---|
| `tests/sss-1.ts` | Full SSS-1 lifecycle: init, minter config, mint, burn, pause, roles, authority transfer, freeze/thaw |
| `tests/sss-2.ts` | Full SSS-2 lifecycle: hook init, blacklist, seize, transfer hook enforcement, multi-minter isolation |
| `tests/access-control.ts` | Role enforcement: unauthorized callers for every instruction |
| `tests/edge-cases.ts` | Boundary conditions: zero amounts, quota limits, metadata length, double pause/unpause |
| `tests/multi-minter.ts` | Concurrent minters: independent quotas, remove/re-add, quota reduction, burn doesn't restore quota |

### Fuzz Testing

Two Trident fuzz binaries in `trident-tests/` targeting invariants:
- `fuzz_0` — Core operations: mint/burn supply invariant, quota enforcement
- `fuzz_1` — Multi-user chaos: concurrent minters, role changes, pause/unpause cycles

---

## Project Structure

```
solana-stablecoin-standard/
├── programs/
│   ├── sss-core/              # Core program: SSS-1 + SSS-2 + SSS-3 (1,630 lines)
│   │   └── src/
│   │       ├── lib.rs         # 15 instruction handlers
│   │       ├── state.rs       # StablecoinConfig, MinterState, AllowlistEntry
│   │       ├── error.rs       # 22 error codes
│   │       ├── constants.rs   # Seeds, presets, limits
│   │       └── instructions/  # One file per instruction (7-step pattern)
│   └── sss-hook/              # Transfer hook program: SSS-2 (595 lines)
│       └── src/
│           ├── lib.rs         # Hook dispatch + blacklist instructions
│           ├── state.rs       # HookConfig, BlacklistEntry
│           └── instructions/  # initialize, transfer_hook, add/remove blacklist
├── modules/
│   └── sss-events/            # Shared event definitions (17 event types)
├── sdk/                       # TypeScript SDK (2,491 lines) + CLI (2,954 lines)
│   └── src/
│       ├── stablecoin.ts      # SolanaStablecoin facade + ComplianceModule
│       ├── client.ts          # StablecoinClient (SSS-1 core operations)
│       ├── compliance.ts      # ComplianceClient (SSS-2 hook + blacklist)
│       ├── builder.ts         # TransactionBuilder (fluent API, all presets)
│       ├── validation.ts      # Zod schemas for SDK boundary validation
│       ├── pda.ts             # 7 PDA derivation helpers
│       ├── types.ts           # TypeScript interfaces matching on-chain state
│       ├── constants.ts       # Program IDs, seeds, preset constants
│       └── cli/               # sss-token CLI (14 command groups)
├── tests/                     # 92 integration tests (5 files)
├── backend/                   # REST API, indexer, webhooks (1,683 lines + 40 tests)
├── tui/                       # Interactive admin TUI (blessed)
├── frontend/                  # Example web dashboard (Next.js + wallet adapter)
├── trident-tests/             # Fuzz testing (2 binaries)
├── docs/                      # 8 documentation files
└── SECURITY.md                # Threat model with 9 attack vectors
```

---

## Devnet Deployment

Both programs are deployed and verified on Solana Devnet with published IDL accounts:

| Program | Address |
|---|---|
| sss-core | [`CZzvCtyZC8KR37DNDeGYpwN46YEc7WEh6RyeSRdhjY4Y`](https://explorer.solana.com/address/CZzvCtyZC8KR37DNDeGYpwN46YEc7WEh6RyeSRdhjY4Y?cluster=devnet) |
| sss-hook | [`9aw7Ac4aGMMfND3BvYgGEcASuvyJiBXnQizbhNBphcNM`](https://explorer.solana.com/address/9aw7Ac4aGMMfND3BvYgGEcASuvyJiBXnQizbhNBphcNM?cluster=devnet) |

---

## Bonus Features

### Interactive Admin TUI

Terminal-based dashboard for monitoring stablecoin state in real-time. Built with [blessed](https://github.com/chjj/blessed).

```bash
cd tui && npm install
npx tsx src/index.ts --mint <MINT_ADDRESS> --rpc https://api.devnet.solana.com
```

Live panels for supply, roles, minters, and blacklist. Keyboard navigation (`q` quit, `r` refresh, `Tab` focus). Adaptive layout for SSS-1 vs SSS-2.

### Example Frontend Dashboard

Next.js 15 web dashboard with Solana wallet integration (Phantom, Solflare). Tabbed interface for Overview, Minters, Operations, Roles, and Compliance. Full transaction signing for all operations.

```bash
cd frontend && npm install && npm run dev
```

### Backend Services

Docker-containerized Node.js services: REST API for all stablecoin operations, event indexer with WebSocket subscriptions, webhook service with retry logic, compliance routes with audit trails. Vitest test suite with 40 tests.

```bash
cd backend && docker compose up
```

---

## Documentation

| Document | Description |
|---|---|
| [ARCHITECTURE.md](docs/ARCHITECTURE.md) | System design, program internals, PDA derivation, account schemas |
| [SDK.md](docs/SDK.md) | Full SDK API reference and usage examples |
| [OPERATIONS.md](docs/OPERATIONS.md) | Operator runbook: deployment, minter management, emergency procedures |
| [SSS-1.md](docs/SSS-1.md) | SSS-1 Minimal preset specification |
| [SSS-2.md](docs/SSS-2.md) | SSS-2 Compliant preset specification |
| [SSS-3.md](docs/SSS-3.md) | SSS-3 Confidential preset specification (on-chain skeleton implemented) |
| [COMPLIANCE.md](docs/COMPLIANCE.md) | Regulatory considerations, audit trail format, compliance procedures |
| [API.md](docs/API.md) | Backend REST API reference, webhook payloads, Docker deployment |
| [SECURITY.md](SECURITY.md) | Threat model with 9 attack vectors and mitigations |

---

## License

MIT. See [LICENSE](LICENSE).
