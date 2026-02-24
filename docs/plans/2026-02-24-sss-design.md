# Solana Stablecoin Standard (SSS) — Design Document

**Date:** 2026-02-24
**Author:** RECTOR
**Bounty:** Superteam Brazil — Build the Solana Stablecoin Standard
**Deadline:** 2026-03-14

---

## 1. Overview

A modular SDK with standardized presets for creating and managing stablecoins on Solana using Token-2022 extensions. Three presets (SSS-1, SSS-2, SSS-3) cover the spectrum from minimal internal tokens to fully regulated compliant stablecoins to privacy-preserving stablecoins.

**Core insight:** Presets are an SDK-level concept, not a program-level concept. Two on-chain programs provide general-purpose tools. The SDK composes them differently per preset.

## 2. Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                     SSS SDK (TypeScript)                      │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌─────────────┐  │
│  │  SSS-1   │  │  SSS-2   │  │  SSS-3   │  │  CLI (Rust) │  │
│  │ Minimal  │  │Compliant │  │ Private  │  │  Admin Tool  │  │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └──────┬──────┘  │
│       └──────────────┴──────────────┴───────────────┘         │
│                     Stablecoin Client                         │
│  - Mint config builder (extension composition)                │
│  - Role management (admin, minter, freezer, pauser)           │
│  - Token operations (mint, burn, freeze, thaw, pause)         │
│  - Confidential ops wrapper (SSS-3)                           │
│  - PDA derivation helpers                                     │
└──────────────────┬──────────────────────┬─────────────────────┘
                   │                      │
     ┌─────────────┴──────────┐ ┌─────────┴──────────────┐
     │     sss-core program   │ │  sss-transfer-hook     │
     │  (Anchor / on-chain)   │ │  (Anchor / on-chain)   │
     │                        │ │                        │
     │  - Role registry PDA   │ │  - Blacklist PDA       │
     │  - Pause state         │ │  - Allowlist PDA       │
     │  - Supply cap          │ │  - Transfer validation │
     │  - Event emission      │ │  - ExtraAccountMeta    │
     │  - Authority mgmt      │ │                        │
     └────────────────────────┘ └────────────────────────┘
                   │                      │
     ┌─────────────┴──────────────────────┴──────────────┐
     │              Token-2022 Program (SPL)              │
     │  Extensions: Metadata, TransferHook, Permanent     │
     │  Delegate, DefaultAccountState, ConfidentialTransfer│
     └────────────────────────────────────────────────────┘
```

### Why 2 programs (not 1 or 3)

- **Not 1:** Transfer hooks MUST be a separate on-chain program (Token-2022 architecture). Even a "single program" approach needs 2 programs minimum.
- **Not 3:** SSS-1 and SSS-2 share ~80% of their code (mint, burn, freeze, thaw, pause, role management). The only difference is SSS-2 adds blacklist management and hooks up the transfer hook. Duplication is a liability.
- **2 is optimal:** `sss-core` is universal (all presets). `sss-transfer-hook` handles compliance enforcement (SSS-2 only). SSS-3 needs no additional on-chain program — confidential transfers are handled by Token-2022 + client-side ZK proofs.

## 3. Preset Specifications

| Feature | SSS-1 (Minimal) | SSS-2 (Compliant) | SSS-3 (Private) |
|---|---|---|---|
| **Use case** | Internal tokens, DAOs | Regulated stablecoins | Privacy-preserving stable |
| **Mint authority** | Single key | Multisig-ready | Multisig-ready |
| **Freeze authority** | Optional | Required | Required |
| **Permanent delegate** | No | Yes (seizure) | Yes (seizure) |
| **Transfer hook** | No | Yes (blacklist) | No (incompatible) |
| **Default account state** | Initialized | Frozen (KYC-gated) | Initialized |
| **Confidential transfers** | No | No | Yes |
| **Auditor key** | N/A | N/A | Yes (regulatory) |
| **Metadata** | Yes | Yes | Yes |
| **Pausable** | Yes | Yes | Yes |
| **Blacklist** | No | Yes (on-chain PDAs) | No |
| **Supply cap** | Optional | Optional | Optional |

### SSS-3 Compliance Model

Transfer hooks and confidential transfers are incompatible on the same mint. SSS-3 uses an alternative compliance approach:

- **Auditor key**: A designated ElGamal public key can decrypt all transfer amounts for KYC/AML without breaking user-to-user privacy
- **Permanent delegate**: Enables seizure/clawback capability
- **Freeze authority**: Can freeze individual accounts under investigation

This provides regulatory compliance through cryptographic oversight rather than transaction-blocking hooks.

## 4. On-Chain Program Design

### 4.1 `sss-core` Program

```
programs/sss-core/src/
├── lib.rs                    # declare_id!, thin #[program] mod
├── state/
│   ├── mod.rs
│   ├── config.rs             # StablecoinConfig PDA
│   └── role.rs               # RoleAccount PDA
├── instructions/
│   ├── mod.rs
│   ├── initialize.rs         # Create config PDA, set initial roles
│   ├── mint_tokens.rs        # Mint with role check + supply cap
│   ├── burn_tokens.rs        # Burn with role check
│   ├── freeze_account.rs     # Freeze token account
│   ├── thaw_account.rs       # Thaw token account
│   ├── pause.rs              # Pause all operations
│   ├── unpause.rs            # Resume operations
│   ├── seize.rs              # Permanent delegate transfer
│   ├── manage_roles.rs       # Grant/revoke roles
│   └── update_config.rs      # Update supply cap, authorities
├── error.rs
├── events.rs
└── constants.rs
```

**State: `StablecoinConfig` PDA**

```rust
#[account]
pub struct StablecoinConfig {
    pub authority: Pubkey,        // Admin authority
    pub mint: Pubkey,             // Associated token mint
    pub preset: u8,               // 1 = SSS-1, 2 = SSS-2, 3 = SSS-3
    pub paused: bool,             // Emergency pause
    pub supply_cap: Option<u64>,  // Optional max supply
    pub total_minted: u64,        // Tracking
    pub total_burned: u64,        // Tracking
    pub bump: u8,                 // PDA bump
    pub _reserved: [u8; 64],      // Future upgrades
}
```

**State: `RoleAccount` PDA**

```rust
#[account]
pub struct RoleAccount {
    pub config: Pubkey,           // Parent config
    pub address: Pubkey,          // Authorized address
    pub role: Role,               // admin | minter | freezer | pauser
    pub granted_by: Pubkey,       // Who granted this role
    pub granted_at: i64,          // Timestamp
    pub bump: u8,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq)]
pub enum Role {
    Admin,
    Minter,
    Freezer,
    Pauser,
}
```

**PDA Seeds:**

| PDA | Seeds |
|---|---|
| StablecoinConfig | `["sss-config", mint]` |
| RoleAccount | `["sss-role", config, address, role]` |

### 4.2 `sss-transfer-hook` Program

```
programs/sss-transfer-hook/src/
├── lib.rs
├── state/
│   ├── mod.rs
│   └── blacklist.rs
├── instructions/
│   ├── mod.rs
│   ├── initialize.rs           # Create ExtraAccountMetaList
│   ├── transfer_hook.rs        # Validate sender/receiver not blacklisted
│   ├── add_to_blacklist.rs
│   └── remove_from_blacklist.rs
├── error.rs
└── constants.rs
```

**State: `BlacklistEntry` PDA**

```rust
#[account]
pub struct BlacklistEntry {
    pub mint: Pubkey,             // Which stablecoin
    pub address: Pubkey,          // Blacklisted address
    pub added_by: Pubkey,         // Who added
    pub added_at: i64,            // Timestamp
    pub reason: String,           // Compliance record (max 128 chars)
    pub bump: u8,
}
```

**PDA Seeds:** `["blacklist", mint, address]`

**Transfer hook validation logic:**
1. Derive blacklist PDAs for sender and receiver
2. If either PDA exists and is initialized → reject transfer
3. Emit event for audit trail

## 5. SDK Design

### 5.1 TypeScript SDK (`@sss/sdk`)

```typescript
// Factory-based API
const stablecoin = await SSS.create(connection, wallet, {
  preset: "sss-2",
  name: "USD Stablecoin",
  symbol: "USDX",
  decimals: 6,
  supplyCap: 1_000_000_000,
});

// Load existing
const stablecoin = await SSS.load(connection, wallet, mintAddress);

// Universal operations (all presets)
await stablecoin.mint(recipient, amount);
await stablecoin.burn(amount);
await stablecoin.freeze(account);
await stablecoin.thaw(account);
await stablecoin.pause();
await stablecoin.unpause();
await stablecoin.roles.grant(address, "minter");
await stablecoin.roles.revoke(address, "minter");
await stablecoin.info();

// SSS-2 compliance
await stablecoin.blacklist.add(address, "OFAC sanctioned");
await stablecoin.blacklist.remove(address);
await stablecoin.seize(fromAddress, toAddress, amount);

// SSS-3 confidential
await stablecoin.confidential.configureAccount(tokenAccount);
await stablecoin.confidential.deposit(amount);
await stablecoin.confidential.applyPending();
await stablecoin.confidential.transfer(recipient, amount);
await stablecoin.confidential.withdraw(amount);
```

**SDK structure:**

```
sdk/
├── src/
│   ├── index.ts              # Barrel exports
│   ├── client.ts             # SSS class (main entry point)
│   ├── presets/
│   │   ├── sss1.ts           # SSS-1 mint config builder
│   │   ├── sss2.ts           # SSS-2 mint config builder
│   │   └── sss3.ts           # SSS-3 mint config builder
│   ├── instructions/
│   │   ├── core.ts           # sss-core instruction builders
│   │   └── hook.ts           # sss-transfer-hook instruction builders
│   ├── confidential/
│   │   ├── index.ts          # Confidential ops wrapper
│   │   ├── keys.ts           # ElGamal/AES key derivation
│   │   └── proofs.ts         # ZK proof helpers
│   ├── pda.ts                # PDA derivation helpers
│   ├── types.ts              # Shared types
│   └── errors.ts             # Custom error classes
├── tests/
│   ├── client.test.ts
│   ├── presets.test.ts
│   ├── pda.test.ts
│   └── confidential.test.ts
└── package.json
```

### 5.2 Rust CLI (`sss-cli`)

```
cli/
├── src/
│   ├── main.rs               # Clap-based CLI entry
│   ├── commands/
│   │   ├── mod.rs
│   │   ├── init.rs            # sss init --preset sss-2
│   │   ├── mint.rs            # sss mint --to <ADDR> --amount 1000
│   │   ├── burn.rs            # sss burn --amount 500
│   │   ├── freeze.rs          # sss freeze --account <ADDR>
│   │   ├── thaw.rs
│   │   ├── pause.rs
│   │   ├── seize.rs
│   │   ├── blacklist.rs       # sss blacklist add/remove
│   │   ├── roles.rs           # sss roles grant/revoke/list
│   │   ├── info.rs            # sss info --mint <ADDR>
│   │   └── confidential.rs    # sss confidential deposit/transfer/withdraw
│   ├── config.rs              # CLI config (keypair path, RPC URL)
│   └── utils.rs
├── Cargo.toml
└── README.md
```

## 6. Backend Services

```
backend/
├── src/
│   ├── main.ts
│   ├── services/
│   │   ├── mint-burn.service.ts    # Mint/burn queue with rate limiting
│   │   ├── event-listener.ts       # On-chain event indexer (WebSocket)
│   │   ├── compliance.service.ts   # Blacklist sync, KYC webhook receiver
│   │   ├── webhook.service.ts      # Outbound webhook notifications
│   │   └── proof.service.ts        # ZK proof generation for SSS-3
│   ├── routes/
│   │   ├── operations.ts           # POST /mint, /burn, /freeze
│   │   ├── compliance.ts           # POST /blacklist, GET /status
│   │   └── health.ts               # GET /health
│   └── middleware/
│       ├── auth.ts                  # API key auth
│       └── rate-limit.ts
├── Dockerfile
├── docker-compose.yml
└── .env.example
```

## 7. Testing Strategy

| Layer | Tool | Scope |
|---|---|---|
| Rust unit tests | `cargo test` | Math, PDA derivation, state validation, role checks |
| SDK unit tests | Vitest | Client builder, preset configs, PDA helpers, error mapping |
| Integration tests | Anchor + Mocha | All instructions per preset, edge cases, multi-user scenarios |
| Fuzz tests | Trident | Role escalation, supply cap overflow, pause bypass, blacklist bypass |
| Devnet scripts | ts-node | Real deployment proof with program IDs + tx signatures |
| Security tests | Custom | Unauthorized access, blacklist circumvention, seizure authorization |

**Integration test files:**

```
tests/
├── sss-1.ts              # SSS-1 full lifecycle
├── sss-2.ts              # SSS-2 full lifecycle with blacklist
├── sss-3.ts              # SSS-3 confidential operations
├── roles.ts              # Role management edge cases
├── transfer-hook.ts      # Hook validation (blocked/allowed transfers)
├── edge-cases.ts         # Zero amounts, max values, overflow
├── multi-user.ts         # Concurrent operations, role interactions
└── security.ts           # Unauthorized access attempts
```

**Devnet proof artifacts:**

```
deployments/
├── devnet-sss-core.json           # { programId, deployTx, timestamp }
├── devnet-transfer-hook.json      # { programId, deployTx, timestamp }
├── devnet-sss1-proof.json         # { mint, initTx, mintTx, burnTx, ... }
├── devnet-sss2-proof.json         # { mint, initTx, blacklistTx, blockedTx, ... }
└── devnet-sss3-proof.json         # { mint, depositTx, confidentialTx, ... }
```

## 8. Bonus Features

### 8.1 SSS-3 — Private Stablecoin (Primary Differentiator)

Confidential transfers with auditor key mechanism. Leverages Token-2022's ConfidentialTransferMint extension with:
- ElGamal keypair derivation per account
- AES key derivation for efficient balance decryption
- ZK range proofs (sufficient funds without revealing amount)
- Equality proofs (sender/receiver encrypt same amount)
- Auditor key for regulatory compliance

Backend proof service handles compute-heavy ZK proof generation.

### 8.2 Oracle Integration Module

Switchboard/Pyth price feed integration:
- Supply cap denominated in USD (not raw tokens)
- Mint rate limiting based on oracle price
- Price-aware events for monitoring

### 8.3 Admin TUI (Rust, ratatui)

Terminal dashboard for stablecoin management:
- Real-time supply/holder stats
- Role management interface
- Blacklist management
- Event log viewer
- Multi-mint support

### 8.4 Example Frontend (Next.js)

Admin dashboard web UI:
- Mint/burn interface
- Blacklist management
- Role management
- Transaction history
- Preset comparison view

## 9. Documentation Plan

| Document | Content |
|---|---|
| `README.md` | Quick start, preset comparison, architecture diagram |
| `docs/ARCHITECTURE.md` | Layer model, data flows, PDA derivation, extension matrix |
| `docs/SDK.md` | TypeScript examples for all 3 presets |
| `docs/CLI.md` | Full Rust CLI command reference |
| `docs/OPERATIONS.md` | Operator runbook (deploy, monitor, incident response) |
| `docs/SSS-1.md` | Standard specification |
| `docs/SSS-2.md` | Standard specification |
| `docs/SSS-3.md` | Standard specification |
| `docs/COMPLIANCE.md` | Regulatory considerations, auditor key model, OFAC |
| `docs/API.md` | Backend REST API reference |
| `docs/SECURITY.md` | Threat model, access control, attack vectors, mitigations |

## 10. Monorepo Structure

```
solana-stablecoin-standard/
├── programs/
│   ├── sss-core/               # Anchor program
│   └── sss-transfer-hook/      # Anchor program
├── sdk/                        # TypeScript SDK (@sss/sdk)
├── cli/                        # Rust CLI (sss-cli)
├── backend/                    # Backend services
├── tui/                        # Admin TUI (ratatui)
├── frontend/                   # Next.js admin dashboard
├── tests/                      # Integration tests
├── trident-tests/              # Fuzz tests
├── scripts/                    # Devnet deployment scripts
├── deployments/                # Devnet proof artifacts
├── docs/                       # All documentation
├── docker-compose.yml          # Full stack docker setup
├── Anchor.toml                 # Anchor workspace config
├── Cargo.toml                  # Rust workspace
├── package.json                # Node workspace root
└── README.md
```

## 11. Competitive Edge

| Dimension | Our Submission | Best Competitor |
|---|---|---|
| SSS-3 (confidential) | Full implementation | None |
| Oracle integration | Yes | None |
| Admin TUI | Yes (ratatui) | None |
| Frontend | Yes (Next.js) | None |
| Fuzz tests | Yes (Trident) | None |
| Devnet proof | All 3 presets | 1-2 presets (PR #5) |
| Rust CLI | Yes (clap) | Yes (PR #5 only) |
| Authority/credentials | $30K+, Solana Foundation, ZK/privacy | Unknown |
| Test coverage | 8 test files, 5 layers | 5 test files max (PR #3) |

## 12. Risk Mitigation

| Risk | Mitigation |
|---|---|
| SSS-3 complexity (ZK proofs) | Start early, leverage SIP Protocol experience, proof backend fallback |
| 18-day timeline | Parallelize with agents, skip features if behind (oracle/TUI are lowest priority) |
| Token-2022 API instability | Pin specific versions, test against devnet early |
| Confidential transfer JS libraries immature | Use Rust-based proof service, TS SDK wraps REST calls |
| Judges unfamiliar with confidential transfers | Clear SSS-3.md spec doc + demo scripts |
