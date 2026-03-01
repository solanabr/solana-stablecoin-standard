# Architecture

## Overview

The Solana Stablecoin Standard (SSS) is a three-layer architecture for creating and managing stablecoins on Solana using Token-2022.

## Layer 1: Base SDK

The foundation layer provides:

- **Token-2022 mint creation** with configurable extensions
- **Role management** via PDA-based access control
- **State management** through the StablecoinState account
- **TypeScript SDK** for client-side interaction
- **CLI tool** for administrative operations

### StablecoinState Account

The central state PDA holds all configuration:

```
Seeds: ["stablecoin", mint_pubkey]
```

Fields:
- `mint`: Token-2022 mint address
- `master_authority`: Admin key
- `name`, `symbol`, `uri`, `decimals`: Token metadata
- `compliance_enabled`: Whether SSS-2 features are active
- `permanent_delegate_enabled`: Permanent delegate extension
- `transfer_hook_enabled`: Transfer hook extension
- `default_account_frozen`: Default frozen state for new accounts
- `paused`: Global pause flag
- `minter_count`: Active minter count

### PDA Authority

The StablecoinState PDA serves as:
1. **Mint authority** — controls token minting
2. **Freeze authority** — controls account freezing
3. **Permanent delegate** (SSS-2) — can transfer tokens from any account

This design ensures all privileged operations go through the program's access control.

## Layer 2: Composable Modules

### Compliance Module

For SSS-2 stablecoins:

- **Transfer Hook Program**: Intercepts every Token-2022 transfer and checks blacklist PDAs for both source and destination. Blocks transfers involving blacklisted addresses.
- **Blacklist PDAs**: Per-address accounts storing blacklist reason and timestamp.
- **Permanent Delegate**: Enables token seizure from blacklisted accounts.

### Privacy Module (Future)

Planned:
- Confidential transfers using Token-2022's confidential transfer extension
- Allowlist-based access control for private transfers

## Layer 3: Standard Presets

### SSS-1: Minimal Stablecoin

Extensions: None (basic Token-2022 mint)
Use cases: DAO stablecoins, community tokens, simple pegs

### SSS-2: Compliant Stablecoin

Extensions: PermanentDelegate, TransferHook, DefaultAccountState
Use cases: Regulated stablecoins, institutional tokens, USDC/USDT-class

## Data Flow

```
User Request → CLI/SDK → Anchor Program → Token-2022 CPI
                                    ↓
                              State PDAs
                              (StablecoinState, MinterState,
                               RoleAssignment, BlacklistEntry)
                                    ↓
                              Program Logs → Indexer → Webhooks
```

## Security Model

### Role Hierarchy

```
Master Authority
├── Minter (per-minter quotas)
├── Burner
├── Pauser
├── Blacklister (SSS-2)
└── Seizer (SSS-2)
```

### Access Control

Every instruction validates the caller against:
1. Master authority (direct check on StablecoinState)
2. Role PDAs (for delegated roles)
3. Minter PDAs (for minting operations)

### Emergency Controls

1. **Pause**: Halts all minting and burning immediately
2. **Freeze**: Individual account freezing
3. **Blacklist + Seize**: Block transfers and recover funds (SSS-2)
4. **Authority Transfer**: Change master authority
