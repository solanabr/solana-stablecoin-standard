# Architecture

## Layer Model

```
┌─────────────────────────────────────────────────────────────┐
│                    Layer 3: Standard Presets                  │
│                                                              │
│   SSS-1 (Minimal)    SSS-2 (Compliant)    SSS-3 (Private)   │
│   Mint + Freeze      SSS-1 + Blacklist    SSS-1 + CT        │
│                      + Perm. Delegate                        │
├─────────────────────────────────────────────────────────────┤
│                    Layer 2: Modules                           │
│                                                              │
│   Compliance Module        Privacy Module        Oracle      │
│   - Transfer Hook          - Confidential        - Price     │
│   - Blacklist PDAs           Transfers             Feeds     │
│   - Permanent Delegate     - Allowlists          - Adjusted  │
│                                                    Minting   │
├─────────────────────────────────────────────────────────────┤
│                    Layer 1: Base SDK                          │
│                                                              │
│   Token-2022 Mint    Role Management    Config PDA           │
│   - Mint Authority   - Master Auth      - Feature Flags      │
│   - Freeze Auth      - Minters/Quotas   - Pause State        │
│   - Metadata         - Burners          - Supply Tracking    │
│                      - Pauser                                │
└─────────────────────────────────────────────────────────────┘
```

## Program Architecture

### Single Configurable Program

One Anchor program (`sss_token`) supports all presets via initialization parameters. Feature flags in `StablecoinConfig` determine which instructions are available:

```rust
pub struct StablecoinConfig {
    pub enable_permanent_delegate: bool,  // SSS-2
    pub enable_transfer_hook: bool,       // SSS-2
    pub enable_confidential_transfers: bool, // SSS-3
    pub default_account_frozen: bool,     // SSS-2
}
```

### PDA Hierarchy

```
Mint (Token-2022)
  └── Config PDA ["config", mint] — mint authority + freeze authority
        ├── Role Manager PDA ["roles", config] — all role assignments
        └── Blacklist PDAs ["blacklist", config, address] — per-address (SSS-2)
```

The config PDA being the mint authority is the key security property — no external keypair can mint tokens directly. All operations go through the program, which checks roles.

## Data Flow

### Mint Flow

```
User → CLI/SDK → mint_tokens instruction
  ├── Check: signer is authorized minter
  ├── Check: minter.minted + amount <= minter.quota
  ├── Check: !config.is_paused
  ├── CPI: token_2022::mint_to (signed by config PDA)
  ├── Update: config.total_minted += amount
  ├── Update: minter.minted += amount
  └── Emit: TokensMinted event
```

### Seize Flow (SSS-2)

```
Operator → CLI/SDK → seize instruction
  ├── Check: signer is seizer or master_authority
  ├── Check: blacklist_entry PDA exists for target
  ├── Check: target account is frozen
  ├── CPI: token_2022::thaw_account (via config PDA)
  ├── CPI: token_2022::transfer_checked (via permanent delegate)
  ├── CPI: token_2022::freeze_account (re-freeze after transfer)
  └── Emit: TokensSeized event
```

## Security Model

### Separation of Duties

| Role | Can Do | Cannot Do |
|------|--------|-----------|
| Master Authority | Everything | N/A |
| Minter | Mint up to quota | Burn, freeze, pause, blacklist |
| Burner | Burn own tokens | Mint, freeze, pause |
| Pauser | Pause + freeze | Unpause, mint, burn |
| Blacklister | Add/remove blacklist | Freeze, seize, mint |
| Seizer | Seize from blacklisted | Blacklist, freeze, mint |

### Asymmetric Pause

The pauser can **pause** operations, but only the master authority can **unpause**. This prevents a compromised pauser from pausing and unpausing at will — stopping the system requires one key, restarting requires a different (higher-privilege) key.

### Per-Minter Quotas

Each minter has an independent quota. Even if a minter key is compromised, the attacker can only mint up to the remaining quota for that minter.

## Project Structure

```
solana-stablecoin-standard/
├── programs/
│   ├── sss-token/          # Main stablecoin program
│   │   └── src/
│   │       ├── instructions/
│   │       │   ├── initialize.rs
│   │       │   ├── mint.rs, burn.rs
│   │       │   ├── freeze.rs, thaw.rs
│   │       │   ├── pause.rs
│   │       │   ├── roles.rs
│   │       │   ├── blacklist.rs
│   │       │   └── seize.rs
│   │       ├── state/
│   │       │   ├── config.rs
│   │       │   ├── roles.rs
│   │       │   └── blacklist.rs
│   │       ├── errors.rs
│   │       └── lib.rs
│   └── oracle-module/      # Oracle price feeds (bonus)
├── sdk/                     # @stbr/sss-token
│   └── src/
│       ├── client.ts        # SolanaStablecoin class
│       ├── compliance.ts    # ComplianceManager (SSS-2)
│       ├── accounts.ts      # Account fetchers
│       ├── types.ts         # TypeScript type definitions
│       ├── presets.ts       # SSS-1/2/3 preset configs
│       ├── constants.ts     # PDA seeds, program IDs
│       └── index.ts         # Public API
├── cli/                     # @stbr/sss-cli
│   └── src/
│       ├── index.ts         # All CLI commands
│       └── helpers.ts       # Connection, wallet, formatting
├── tests/
│   ├── sss-1.test.ts        # SSS-1 tests (10)
│   ├── sss-2.test.ts        # SSS-2 tests (8)
│   ├── sss-3.test.ts        # SSS-3 tests (3)
│   └── oracle.test.ts       # Oracle tests (4)
└── docs/                    # Documentation
```
