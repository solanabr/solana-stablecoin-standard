# Architecture

## System Design

The Solana Stablecoin Standard is built on a three-layer architecture that provides modularity and composability.

### Layer 1: Base SDK (Token-2022 Foundation)

The foundation layer wraps Solana's Token-2022 program, providing:

- **Token-2022 Mint** with configurable extensions
- **StablecoinConfig PDA** — central configuration account storing all stablecoin parameters
- **RoleAssignment PDAs** — per-address role bitmask for access control

#### Account Structure

```
StablecoinConfig PDA
  Seeds: [b"stablecoin-config", mint_pubkey]
  Owner: Stablecoin Program
  ┌─────────────────────────────┐
  │ bump: u8                    │
  │ mint: Pubkey                │
  │ authority: Pubkey           │
  │ preset: Preset              │
  │ features: FeatureFlags      │
  │ paused: bool                │
  │ total_minted: u64           │
  │ total_burned: u64           │
  │ decimals: u8                │
  │ name: [u8; 32]             │
  │ symbol: [u8; 10]           │
  │ transfer_hook_program: Pubkey│
  │ created_at: u64             │
  │ updated_at: u64             │
  │ _reserved: [u8; 128]       │
  └─────────────────────────────┘

RoleAssignment PDA
  Seeds: [b"role", config_pubkey, holder_pubkey]
  ┌─────────────────────────────┐
  │ bump: u8                    │
  │ config: Pubkey              │
  │ holder: Pubkey              │
  │ role_mask: u8               │
  │   bit 0: Minter             │
  │   bit 1: Burner             │
  │   bit 2: Pauser             │
  │   bit 3: ComplianceOfficer  │
  │ mint_quota: u64             │
  │ minted_amount: u64          │
  │ updated_at: u64             │
  └─────────────────────────────┘
```

### Layer 2: Composable Modules

#### Compliance Module (SSS-2)

The compliance module adds:

- **Permanent Delegate Extension** — allows the config PDA to transfer tokens from any account
- **Transfer Hook Program** — separate program that enforces blacklist checks on every transfer
- **BlacklistEntry PDAs** — one per blacklisted address per mint

```
BlacklistEntry PDA
  Seeds: [b"blacklist", mint_pubkey, flagged_address]
  ┌─────────────────────────────┐
  │ bump: u8                    │
  │ mint: Pubkey                │
  │ address: Pubkey             │
  │ created_at: u64             │
  │ added_by: Pubkey            │
  └─────────────────────────────┘
```

#### Transfer Hook Flow

```
User initiates transfer
        │
        ▼
Token-2022 processes transfer
        │
        ▼
Token-2022 CPIs into Transfer Hook Program
        │
        ▼
Hook reads blacklist PDAs for source & destination
        │
        ├── PDA exists (blacklisted) → REJECT transfer
        └── PDA empty → ALLOW transfer
```

### Layer 3: Standard Presets

Presets are predefined combinations of features:

| Feature | SSS-1 | SSS-2 | Custom |
|---------|-------|-------|--------|
| Mint Authority (PDA) | ✓ | ✓ | Configurable |
| Freeze Authority | ✓ | ✓ | Configurable |
| Token Metadata | ✓ | ✓ | ✓ |
| Role-Based Access | ✓ | ✓ | ✓ |
| Pause/Unpause | ✓ | ✓ | ✓ |
| Permanent Delegate | ✗ | ✓ | Configurable |
| Transfer Hook (Blacklist) | ✗ | ✓ | Configurable |
| Confidential Transfers | ✗ | ✗ | Configurable |

## Security Model

### Authority Hierarchy

```
Master Authority
  └── Can: manage all roles, unpause, transfer authority
      │
      ├── Minter Role (with optional quota)
      │     └── Can: mint tokens
      │
      ├── Burner Role
      │     └── Can: burn tokens
      │
      ├── Pauser Role
      │     └── Can: pause, freeze/thaw accounts
      │
      └── Compliance Officer Role (SSS-2 only)
            └── Can: blacklist/unblacklist, seize tokens
```

### PDA-Based Authority

All critical authorities (mint authority, freeze authority, permanent delegate) are held by the `StablecoinConfig` PDA, not by individual wallets. This means:

1. No single key can unilaterally mint or freeze — the program logic enforces role checks
2. Authority transfer is a controlled on-chain operation
3. The permanent delegate (SSS-2) can only be exercised through program instructions that verify compliance officer role and blacklist status

## Program Interactions

```
┌─────────────────┐     CPI      ┌───────────────────┐
│   Stablecoin    │────────────►│    Token-2022      │
│    Program      │              │    Program         │
│                 │              │                    │
│  - initialize   │              │  - initialize_mint │
│  - mint_tokens  │              │  - mint_to         │
│  - burn_tokens  │              │  - burn            │
│  - freeze       │              │  - freeze_account  │
│  - thaw         │              │  - thaw_account    │
│  - seize        │              │  - transfer        │
└────────┬────────┘              └────────┬───────────┘
         │                                │
         │                                │ CPI (on transfer)
         │                                ▼
         │                       ┌───────────────────┐
         │                       │  Transfer Hook    │
         │                       │    Program        │
         │ reads blacklist PDAs  │                   │
         └──────────────────────►│  - execute        │
                                 │  - checks source  │
                                 │  - checks dest    │
                                 └───────────────────┘
```
