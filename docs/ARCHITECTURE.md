# Architecture

## Overview

The Solana Stablecoin Standard follows a three-layer architecture designed for modularity and composability.

## Layer Model

### Layer 1 — Base SDK

The foundation layer provides:

- **Token-2022 mint creation** with configurable extensions
- **Mint authority** — controlled token issuance
- **Freeze authority** — ability to freeze individual accounts
- **Token metadata** — on-chain name, symbol, URI
- **Role management program** — RBAC via on-chain PDA accounts
- **CLI + TypeScript SDK** — developer and operator interfaces

Every stablecoin built with SSS uses Layer 1. The issuer chooses which extensions to enable at initialization time.

### Layer 2 — Modules

Composable pieces that add capabilities on top of Layer 1:

- **Compliance Module** — Transfer hook, blacklist PDAs, permanent delegate. Enables on-chain enforcement of sanctions lists and regulatory requirements.
- **Privacy Module** *(experimental)* — Confidential transfers, scoped allowlists. For stablecoins requiring transaction privacy.

Each module is independently testable and optional. Modules are activated at initialization time and cannot be retroactively added (Token-2022 extension limitation).

### Layer 3 — Standard Presets

Opinionated combinations of Layer 1 + Layer 2:

- **SSS-1 (Minimal)** — Layer 1 only. No compliance extensions.
- **SSS-2 (Compliant)** — Layer 1 + Compliance Module.

## Data Flow

### Initialization Flow

```
User → CLI/SDK → Create Token-2022 Mint (with extensions)
                → Initialize StablecoinConfig PDA
                → Create Authority RoleAccount PDA
                → (SSS-2) Initialize Transfer Hook ExtraAccountMetas
```

### Mint Flow

```
Minter → sss-token mint →  Verify MINTER role
                         → Check MinterConfig quota
                         → Check not paused
                         → CPI: token_2022::mint_to
                         → Update totalMinted counter
                         → Emit TokensMinted event
```

### Transfer Flow (SSS-2)

```
User → token_2022::transfer_checked
     → Transfer Hook invoked automatically
       → Load StablecoinConfig (extra account)
       → Check sender blacklist PDA (exists = blocked)
       → Check recipient blacklist PDA (exists = blocked)
       → If both clean → transfer proceeds
       → If either blacklisted → transfer reverted
```

### Seize Flow (SSS-2)

```
Seizer → sss-token seize → Verify SEIZER role
                          → Verify permanent delegate enabled
                          → CPI: token_2022::transfer_checked (as delegate)
                          → Move all tokens to treasury
                          → Emit TokensSeized event
```

## Security Model

### Role-Based Access Control

Roles are stored in on-chain PDA accounts derived from `["roles", stablecoin_config, holder]`. Each role is a bit flag in a u16 field:

| Bit | Role | Value |
|-----|------|-------|
| 0 | MINTER | 1 |
| 1 | BURNER | 2 |
| 2 | PAUSER | 4 |
| 3 | BLACKLISTER | 8 |
| 4 | SEIZER | 16 |
| 5 | FREEZER | 32 |

Only the **master authority** can grant/revoke roles. The authority key is stored in `StablecoinConfig.authority` and can be transferred.

### Per-Minter Quotas

Each minter has a separate `MinterConfig` PDA tracking:
- Maximum tokens allowed (quota, 0 = unlimited)
- Tokens minted so far
- Active/inactive status

This prevents a single compromised minter key from minting unlimited tokens.

### Emergency Controls

- **Pause** — Immediately halts all mint/burn operations
- **Freeze** — Freezes individual token accounts
- **Seize** (SSS-2) — Recovers tokens from compromised/sanctioned accounts

### Feature Gating

SSS-2 instructions (blacklist, seize) check the stablecoin config at runtime:

```rust
constraint = stablecoin_config.enable_transfer_hook @ SSSError::ComplianceNotEnabled
```

If compliance wasn't enabled during initialization, these instructions fail gracefully with a clear error.

## Account Structure

```
StablecoinConfig PDA
  seeds: ["stablecoin", mint_pubkey]
  ├── authority: Pubkey
  ├── mint: Pubkey
  ├── name, symbol, uri, decimals
  ├── enable_permanent_delegate: bool
  ├── enable_transfer_hook: bool
  ├── paused: bool
  ├── total_minted, total_burned: u64
  └── _reserved: [u8; 64]

RoleAccount PDA
  seeds: ["roles", stablecoin_config, holder]
  ├── roles: u16 (bitfield)
  └── bump: u8

MinterConfig PDA
  seeds: ["minter", stablecoin_config, minter]
  ├── quota: u64
  ├── minted: u64
  └── active: bool

BlacklistEntry PDA (SSS-2)
  seeds: ["blacklist", stablecoin_config, target]
  ├── reason: String
  ├── added_by: Pubkey
  └── added_at: i64
```

## On-Chain Programs

| Program | Purpose |
|---------|---------|
| `sss_token` | Core stablecoin logic — initialize, mint, burn, freeze, thaw, pause, roles, blacklist, seize |
| `sss_transfer_hook` | SPL Transfer Hook — enforces blacklist checks on every Token-2022 transfer |

Both programs are deployed as a pair. The transfer hook program ID is registered in the mint at creation time.
