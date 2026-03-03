# Solana Stablecoin Standard (SSS)

A modular two-program framework for issuing compliant stablecoins on Solana using Token-2022
extensions: PermanentDelegate, TransferHook, and DefaultAccountState.

---

## Key Differentiators

**MasterMinter + Decrementing Allowance** — Inspired by Circle USDC. Each minter receives a
capped allowance that decrements on every mint call. Admins increment allowances independently,
enabling delegated minting without unlimited authority.

**Burn+Mint Seize** — Inspired by Tether's `destroyBlackFunds`. Atomically thaws a frozen
account, burns tokens via PermanentDelegate, re-freezes the account, and mints the equivalent
amount to the treasury. Avoids transfer hook conflicts entirely.

**Two-Step Admin Transfer** — Inspired by Circle's `transferOwnership`. `transfer_admin` sets a
pending admin; `accept_admin` confirms. The current admin retains control until the new admin
explicitly accepts, preventing accidental lockout.

**Blacklist on ALL Operations** — Blacklisted addresses are rejected not only on transfers but
also on `mint_to` and `burn_from`. The TransferHook enforces this at the protocol level for
transfers; the core program enforces it for all other operations.

---

## Presets

| Feature                          | SSS-1 (Minimal) | SSS-2 (Compliant) | SSS-3 (Confidential) |
|----------------------------------|:---------------:|:-----------------:|:--------------------:|
| MetadataPointer + TokenMetadata  | Yes             | Yes               | Yes                  |
| Role-based Access (5 roles)      | Yes             | Yes               | Yes                  |
| Pause / Unpause                  | Yes             | Yes               | Yes                  |
| PermanentDelegate                | No              | Yes               | Yes                  |
| DefaultAccountState (Frozen)     | No              | Yes               | Yes                  |
| TransferHook (Blacklist)         | No              | Yes               | Yes                  |
| ConfidentialTransferMint         | No              | No                | Yes (PoC)            |

SSS-1 is suitable for low-risk internal issuance. SSS-2 adds the full compliance stack required
for regulated stablecoins. SSS-3 extends SSS-2 with confidential transfers (proof-of-concept).

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        Off-chain Layer                       │
│                                                              │
│   @sss/cli  ──────►  @sss/sdk  ──────►  @sss/backend        │
│  (sss-token)      (PDA helpers,       (REST API, indexer,   │
│                    Stablecoin class)   webhooks)             │
└──────────────────────────┬──────────────────────────────────┘
                           │ RPC
┌──────────────────────────▼──────────────────────────────────┐
│                       On-chain Layer                         │
│                                                              │
│  ┌─────────────────────────────────┐                        │
│  │           sss-core              │                        │
│  │  (Anchor, 17 instructions)      │                        │
│  │                                 │                        │
│  │  create_mint    mint_to         │                        │
│  │  burn_from      seize           │                        │
│  │  grant_role     revoke_role     │                        │
│  │  increment_allowance            │                        │
│  │  blacklist      unblacklist     │                        │
│  │  pause          unpause         │                        │
│  │  transfer_admin accept_admin    │                        │
│  │  initialize_hook                │                        │
│  │  freeze_account thaw_account    │                        │
│  │  set_metadata                   │                        │
│  └──────────────────┬──────────────┘                        │
│                     │ CPI (on SSS-2/SSS-3 transfers)        │
│  ┌──────────────────▼──────────────┐                        │
│  │        sss-transfer-hook        │                        │
│  │  (Anchor, 5 instructions)       │                        │
│  │                                 │                        │
│  │  initialize_hook_config         │                        │
│  │  initialize_extra_account_      │                        │
│  │    meta_list                    │                        │
│  │  transfer_hook                  │                        │
│  │  add_to_blacklist               │                        │
│  │  remove_from_blacklist          │                        │
│  └─────────────────────────────────┘                        │
│                                                              │
│  Token-2022 Extensions used:                                 │
│    PermanentDelegate  ·  TransferHook  ·  DefaultAccountState│
│    MetadataPointer    ·  TokenMetadata ·  ConfidentialTransfer│
└─────────────────────────────────────────────────────────────┘
```

---

## Quick Start

### Prerequisites

- Solana CLI v2.1+
- Anchor CLI v0.32.1
- Node.js v20+
- Rust 1.85+

### Build

```bash
# Install dependencies
yarn install

# Build on-chain programs
anchor build

# Build SDK and CLI
yarn build:sdk
yarn build:cli
```

### Test

```bash
# Run full test suite (254 tests)
anchor test

# Run only unit tests
anchor test --skip-deploy

# Run E2E tests against localnet
anchor test tests/e2e
```

### Create a Stablecoin

```bash
# SSS-1: minimal issuance, no compliance extensions
sss-token create --name "My Dollar" --symbol MUSD --decimals 6 --preset sss-1

# SSS-2: compliant with PermanentDelegate, DefaultAccountState, and TransferHook
sss-token create --name "Compliant Dollar" --symbol CUSD --decimals 6 \
  --preset sss-2 \
  --transfer-hook-program Hook1111111111111111111111111111111111111111 \
  --treasury <TREASURY_PUBKEY>
```

### Common Operations

```bash
# Grant minter role with allowance cap
sss-token grant-role --mint <MINT> --address <MINTER> --role minter --allowance 1000000000

# Mint tokens (decrements minter allowance)
sss-token mint --mint <MINT> --to <RECIPIENT> --amount 1000000

# Blacklist an address (blocks mint, burn, and transfers)
sss-token blacklist --mint <MINT> --address <BAD_ACTOR>

# Seize funds from a blacklisted account (burn+mint to treasury)
sss-token seize --mint <MINT> --from <BAD_ACTOR_TOKEN_ACCOUNT>

# Pause all operations
sss-token pause --mint <MINT>

# Initiate two-step admin transfer
sss-token transfer-admin --mint <MINT> --new-admin <NEW_ADMIN_PUBKEY>
# New admin must then run:
sss-token accept-admin --mint <MINT>
```

---

## Programs

| Program           | Description                            | Program ID                                       |
|-------------------|----------------------------------------|--------------------------------------------------|
| sss-core          | Core stablecoin operations (17 ixs)    | `FH3XosNdAdUPfcxVxjUrUoCrGaLw9L3i9eadu7M8nQZQ` |
| sss-transfer-hook | TransferHook blacklist enforcement (5 ixs) | `Hook1111111111111111111111111111111111111111` |

---

## Role-Based Access

Five roles govern protocol operations. The admin assigns and revokes roles independently.

| Role               | Capabilities                                                            |
|--------------------|-------------------------------------------------------------------------|
| Minter             | Call `mint_to` up to their remaining allowance cap                      |
| Burner             | Call `burn_from` on any token account via PermanentDelegate             |
| Seizer             | Call `seize` to atomically burn and re-mint from blacklisted accounts   |
| Pauser             | Call `pause` and `unpause` to halt or resume all operations             |
| ComplianceOfficer  | Call `freeze_account` and `thaw_account` on individual accounts         |

Roles are stored as individual `RoleAccount` PDAs per (config, holder, role). A single address may hold multiple roles.
The admin role is separate and controls role grants, revocations, and allowance increments.
Admin transfer uses a two-step pending confirmation to prevent lockout.

---

## Test Suite

**254 tests passing, 0 failing.**

| Category        | Files | Coverage                                                      |
|-----------------|-------|---------------------------------------------------------------|
| sss-core unit   | 14    | All 17 instructions, role enforcement, allowance logic        |
| sss-transfer-hook unit | 3 | Hook initialization, blacklist add/remove, transfer gate |
| E2E             | 6     | Full mint lifecycle, seize flow, pause/unpause, admin transfer |
| Security        | -     | Reentrancy, authority escalation, blacklist bypass, overflow  |

---

## Documentation

- [Architecture](docs/ARCHITECTURE.md) — Program design, PDA layout, extension rationale, and data flow
- [Security](docs/SECURITY.md) — Threat model, attack surface analysis, and mitigation strategies

---

## License

MIT
