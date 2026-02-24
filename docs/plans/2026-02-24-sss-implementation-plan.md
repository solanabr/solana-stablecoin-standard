# SSS Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build the winning submission for the Superteam Brazil "Solana Stablecoin Standard" bounty ($5K, $2.5K 1st place) — a modular SDK with 3 presets, 2 on-chain programs, CLI, backend, TUI, frontend, and comprehensive testing.

**Architecture:** Two Anchor programs (`sss-core` for universal stablecoin management, `sss-transfer-hook` for compliance enforcement) composed by a TypeScript SDK into 3 presets: SSS-1 (minimal), SSS-2 (compliant with transfer hooks), SSS-3 (private with confidential transfers). SSS-3 is our killer differentiator — no competitor has it.

**Tech Stack:** Anchor 0.32.1, Solana CLI 3.0.13, Rust 1.93, TypeScript (pnpm workspace), Vitest, Trident, ratatui, Next.js 15, Express/Fastify.

**Design Doc:** `docs/plans/2026-02-24-sss-design.md`

**Timeline:** 18 days (Feb 24 → Mar 14, 2026)

---

## Phase Map & Dependencies

```
Phase 0: Scaffolding (Day 1)
    │
    ├──► Phase 1: sss-core program (Days 2-4)  ──┐
    │                                              ├──► Phase 3: Integration Tests (Days 5-6)
    ├──► Phase 2: sss-transfer-hook (Days 2-3)  ──┘         │
    │                                                         ├──► Phase 4: TypeScript SDK (Days 7-9)
    │                                                         │         │
    │                                                         │         ├──► Phase 5: Rust CLI (Days 10-11)
    │                                                         │         ├──► Phase 6: Backend (Day 12)
    │                                                         │         ├──► Phase 7: SSS-3 (Days 13-15) ★ differentiator
    │                                                         │         └──► Phase 10: Frontend (Days 16-17)
    │                                                         │
    │                                                         ├──► Phase 8: Oracle Integration (Day 13)
    │                                                         └──► Phase 11: Fuzz Tests (Day 14)
    │
    └──► Phase 9: Admin TUI (Days 15-16, independent Rust)

Phase 12: Documentation & Polish (Day 17)
Phase 13: Devnet Deployment & Proofs (Day 17-18)
Phase 14: Final Audit & Submission (Day 18)
```

**Parallelization opportunities:**
- Phase 1 + Phase 2 (two independent programs)
- Phase 5 + Phase 6 + Phase 7 (independent consumers of SDK)
- Phase 8 + Phase 9 + Phase 10 + Phase 11 (all independent bonus features)

---

## Phase 0: Project Scaffolding

### Task 0.1: Initialize Anchor Workspace

**Files:**
- Create: `Anchor.toml`
- Create: `Cargo.toml` (workspace root)
- Create: `package.json` (pnpm workspace root)
- Create: `pnpm-workspace.yaml`
- Create: `tsconfig.json`
- Create: `.gitignore`
- Create: `CLAUDE.md` (project-level)

**Step 1: Initialize Anchor workspace**

```bash
cd ~/local-dev/solana-stablecoin-standard
anchor init --no-git . 2>/dev/null || true
```

> If `anchor init` doesn't work in an existing dir, manually create the files.

**Step 2: Create Anchor.toml**

```toml
[toolchain]
anchor_version = "0.32.1"

[features]
resolution = true
skip-lint = false

[programs.localnet]
sss_core = "CoreXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"
sss_transfer_hook = "HookXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"

[programs.devnet]
sss_core = "CoreXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"
sss_transfer_hook = "HookXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"

[registry]
url = "https://api.apr.dev"

[provider]
cluster = "localnet"
wallet = "~/.config/solana/id.json"

[scripts]
test = "pnpm run test"
```

> Note: Program IDs are placeholders. Generate real keypairs with `solana-keygen grind --starts-with Core:1` and `solana-keygen grind --starts-with Hook:1` during scaffolding.

**Step 3: Create Rust workspace Cargo.toml**

```toml
[workspace]
members = [
    "programs/sss-core",
    "programs/sss-transfer-hook",
    "cli",
    "tui",
]
resolver = "2"

[workspace.dependencies]
anchor-lang = "0.32.0"
anchor-spl = "0.32.0"
spl-token-2022 = "7"
spl-transfer-hook-interface = "0.9"
solana-sdk = "2.2"
solana-client = "2.2"
solana-program = "2.2"
```

> Pin workspace dependencies for consistency. All crates reference `workspace = true`.

**Step 4: Create pnpm workspace**

`pnpm-workspace.yaml`:
```yaml
packages:
  - "sdk"
  - "backend"
  - "frontend"
  - "tests"
  - "scripts"
```

`package.json`:
```json
{
  "name": "solana-stablecoin-standard",
  "private": true,
  "scripts": {
    "build": "anchor build",
    "test": "anchor test",
    "test:sdk": "pnpm --filter @sss/sdk test",
    "test:integration": "pnpm --filter sss-tests test",
    "lint": "eslint . --ext .ts,.tsx",
    "typecheck": "tsc --noEmit"
  },
  "devDependencies": {
    "@coral-xyz/anchor": "^0.32.0",
    "typescript": "^5.7",
    "vitest": "^3",
    "eslint": "^9"
  }
}
```

**Step 5: Create .gitignore**

```gitignore
# Anchor
target/
.anchor/
test-ledger/

# Node
node_modules/
dist/
*.tgz

# Solana
*.so

# Environment
.env
.env.*
!.env.example

# IDE
.idea/
.vscode/
*.swp

# OS
.DS_Store
Thumbs.db

# Trident
trident-tests/fuzz_tests/fuzzing/hfuzz_workspace/

# Lock files managed by workspace
# Keep pnpm-lock.yaml and Cargo.lock
```

**Step 6: Create project CLAUDE.md**

```markdown
# SSS — Solana Stablecoin Standard

## Quick Reference
- **Anchor programs:** `programs/sss-core/`, `programs/sss-transfer-hook/`
- **TypeScript SDK:** `sdk/` (pnpm workspace: `@sss/sdk`)
- **Rust CLI:** `cli/` (cargo workspace: `sss-cli`)
- **Backend:** `backend/` (Express/Fastify)
- **TUI:** `tui/` (ratatui)
- **Frontend:** `frontend/` (Next.js 15)
- **Integration tests:** `tests/`
- **Fuzz tests:** `trident-tests/`

## Architecture
Two Anchor programs composed by SDK into 3 presets:
- SSS-1 (minimal): sss-core only
- SSS-2 (compliant): sss-core + sss-transfer-hook
- SSS-3 (private): sss-core + Token-2022 ConfidentialTransfer (no hook — incompatible)

## Build & Test
- `anchor build` — build programs
- `anchor test` — integration tests
- `pnpm test:sdk` — SDK unit tests
- `cargo test` — Rust unit tests
- `cargo run --bin sss-cli -- --help` — CLI

## Key Design Decisions
- Presets are SDK-level, not program-level
- Transfer hooks + confidential transfers are INCOMPATIBLE
- SSS-3 uses auditor key for compliance instead of hooks
- Role-based access: admin, minter, freezer, pauser (PDA per role per address)

## PDA Seeds
- StablecoinConfig: `["sss-config", mint.key()]`
- RoleAccount: `["sss-role", config.key(), address.key(), role_u8]`
- BlacklistEntry: `["blacklist", mint.key(), address.key()]`
```

**Step 7: Generate program keypairs and create program scaffolds**

```bash
# Generate vanity keypairs for programs
solana-keygen grind --starts-with Core:1 --ignore-case
solana-keygen grind --starts-with Hook:1 --ignore-case

# Create program directories
mkdir -p programs/sss-core/src/{state,instructions}
mkdir -p programs/sss-transfer-hook/src/{state,instructions}
mkdir -p sdk/src/{presets,instructions,confidential}
mkdir -p sdk/tests
mkdir -p cli/src/commands
mkdir -p backend/src/{services,routes,middleware}
mkdir -p tui/src
mkdir -p frontend
mkdir -p tests
mkdir -p trident-tests
mkdir -p scripts
mkdir -p deployments
```

**Step 8: Commit scaffolding**

```bash
git add -A
git commit -m "chore: initialize monorepo scaffolding

Anchor workspace with 2 programs (sss-core, sss-transfer-hook),
pnpm workspace (sdk, backend, frontend, tests, scripts),
Rust workspace (cli, tui)."
```

---

## Phase 1: sss-core Program

### Task 1.1: State Definitions

**Files:**
- Create: `programs/sss-core/src/state/mod.rs`
- Create: `programs/sss-core/src/state/config.rs`
- Create: `programs/sss-core/src/state/role.rs`
- Create: `programs/sss-core/src/error.rs`
- Create: `programs/sss-core/src/events.rs`
- Create: `programs/sss-core/src/constants.rs`
- Create: `programs/sss-core/src/lib.rs`
- Create: `programs/sss-core/Cargo.toml`

**Step 1: Create Cargo.toml**

```toml
[package]
name = "sss-core"
version = "0.1.0"
description = "Solana Stablecoin Standard - Core Program"
edition = "2021"

[lib]
crate-type = ["cdylib", "lib"]
name = "sss_core"

[features]
no-entrypoint = []
no-idl = []
no-log-ix-name = []
cpi = ["no-entrypoint"]
default = []
idl-build = ["anchor-lang/idl-build", "anchor-spl/idl-build"]

[dependencies]
anchor-lang = { workspace = true }
anchor-spl = { workspace = true }
```

**Step 2: Create constants.rs**

```rust
pub const SSS_CONFIG_SEED: &[u8] = b"sss-config";
pub const SSS_ROLE_SEED: &[u8] = b"sss-role";
pub const MAX_REASON_LEN: usize = 128;
pub const CONFIG_SPACE: usize = 8 + // discriminator
    32 +  // authority
    32 +  // mint
    1 +   // preset
    1 +   // paused
    1 + 8 + // Option<u64> supply_cap
    8 +   // total_minted
    8 +   // total_burned
    1 +   // bump
    64;   // _reserved

pub const ROLE_SPACE: usize = 8 + // discriminator
    32 +  // config
    32 +  // address
    1 +   // role (enum)
    32 +  // granted_by
    8 +   // granted_at
    1;    // bump
```

**Step 3: Create state/config.rs**

```rust
use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace)]
pub struct StablecoinConfig {
    pub authority: Pubkey,
    pub mint: Pubkey,
    pub preset: u8,          // 1 = SSS-1, 2 = SSS-2, 3 = SSS-3
    pub paused: bool,
    pub supply_cap: Option<u64>,
    pub total_minted: u64,
    pub total_burned: u64,
    pub bump: u8,
    #[max_len(64)]
    pub _reserved: Vec<u8>,
}

impl StablecoinConfig {
    pub fn current_supply(&self) -> u64 {
        self.total_minted.saturating_sub(self.total_burned)
    }

    pub fn can_mint(&self, amount: u64) -> bool {
        match self.supply_cap {
            Some(cap) => self.current_supply().checked_add(amount).map_or(false, |new| new <= cap),
            None => self.current_supply().checked_add(amount).is_some(),
        }
    }
}
```

> Note: Use `#[derive(InitSpace)]` instead of manual const SPACE if Anchor 0.32 supports it. Otherwise fall back to `CONFIG_SPACE` constant. Verify during implementation.

**Step 4: Create state/role.rs**

```rust
use anchor_lang::prelude::*;

#[account]
pub struct RoleAccount {
    pub config: Pubkey,
    pub address: Pubkey,
    pub role: Role,
    pub granted_by: Pubkey,
    pub granted_at: i64,
    pub bump: u8,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace)]
pub enum Role {
    Admin,
    Minter,
    Freezer,
    Pauser,
}

impl Role {
    pub fn as_u8(&self) -> u8 {
        match self {
            Role::Admin => 0,
            Role::Minter => 1,
            Role::Freezer => 2,
            Role::Pauser => 3,
        }
    }
}
```

**Step 5: Create error.rs**

```rust
use anchor_lang::prelude::*;

#[error_code]
pub enum SssError {
    #[msg("Operations are paused")]
    Paused,
    #[msg("Operations are not paused")]
    NotPaused,
    #[msg("Supply cap exceeded")]
    SupplyCapExceeded,
    #[msg("Unauthorized: missing required role")]
    Unauthorized,
    #[msg("Invalid preset value")]
    InvalidPreset,
    #[msg("Cannot remove the last admin")]
    LastAdmin,
    #[msg("Overflow in arithmetic operation")]
    ArithmeticOverflow,
    #[msg("Mint mismatch")]
    MintMismatch,
    #[msg("Invalid supply cap: must be >= current supply")]
    InvalidSupplyCap,
    #[msg("Account already frozen")]
    AlreadyFrozen,
    #[msg("Account not frozen")]
    NotFrozen,
    #[msg("Amount must be greater than zero")]
    ZeroAmount,
}
```

**Step 6: Create events.rs**

```rust
use anchor_lang::prelude::*;

#[event]
pub struct StablecoinInitialized {
    pub mint: Pubkey,
    pub authority: Pubkey,
    pub preset: u8,
    pub supply_cap: Option<u64>,
}

#[event]
pub struct TokensMinted {
    pub mint: Pubkey,
    pub to: Pubkey,
    pub amount: u64,
    pub minter: Pubkey,
    pub new_supply: u64,
}

#[event]
pub struct TokensBurned {
    pub mint: Pubkey,
    pub from: Pubkey,
    pub amount: u64,
    pub burner: Pubkey,
    pub new_supply: u64,
}

#[event]
pub struct AccountFrozen {
    pub mint: Pubkey,
    pub account: Pubkey,
    pub freezer: Pubkey,
}

#[event]
pub struct AccountThawed {
    pub mint: Pubkey,
    pub account: Pubkey,
    pub freezer: Pubkey,
}

#[event]
pub struct OperationsPaused {
    pub mint: Pubkey,
    pub pauser: Pubkey,
}

#[event]
pub struct OperationsUnpaused {
    pub mint: Pubkey,
    pub pauser: Pubkey,
}

#[event]
pub struct TokensSeized {
    pub mint: Pubkey,
    pub from: Pubkey,
    pub to: Pubkey,
    pub amount: u64,
    pub seizer: Pubkey,
}

#[event]
pub struct RoleGranted {
    pub config: Pubkey,
    pub address: Pubkey,
    pub role: u8,
    pub granted_by: Pubkey,
}

#[event]
pub struct RoleRevoked {
    pub config: Pubkey,
    pub address: Pubkey,
    pub role: u8,
    pub revoked_by: Pubkey,
}

#[event]
pub struct ConfigUpdated {
    pub config: Pubkey,
    pub field: String,
    pub updater: Pubkey,
}
```

**Step 7: Create state/mod.rs**

```rust
pub mod config;
pub mod role;

pub use config::*;
pub use role::*;
```

**Step 8: Create lib.rs with thin #[program] module**

```rust
use anchor_lang::prelude::*;

pub mod constants;
pub mod error;
pub mod events;
pub mod instructions;
pub mod state;

declare_id!("REPLACE_WITH_GENERATED_CORE_KEYPAIR");

#[program]
pub mod sss_core {
    use super::*;

    pub fn initialize(ctx: Context<instructions::Initialize>, args: instructions::InitializeArgs) -> Result<()> {
        instructions::initialize::handler(ctx, args)
    }

    pub fn mint_tokens(ctx: Context<instructions::MintTokens>, amount: u64) -> Result<()> {
        instructions::mint_tokens::handler(ctx, amount)
    }

    pub fn burn_tokens(ctx: Context<instructions::BurnTokens>, amount: u64) -> Result<()> {
        instructions::burn_tokens::handler(ctx, amount)
    }

    pub fn freeze_account(ctx: Context<instructions::FreezeAccount>) -> Result<()> {
        instructions::freeze_account::handler(ctx)
    }

    pub fn thaw_account(ctx: Context<instructions::ThawAccount>) -> Result<()> {
        instructions::thaw_account::handler(ctx)
    }

    pub fn pause(ctx: Context<instructions::Pause>) -> Result<()> {
        instructions::pause::handler(ctx)
    }

    pub fn unpause(ctx: Context<instructions::Unpause>) -> Result<()> {
        instructions::unpause::handler(ctx)
    }

    pub fn seize(ctx: Context<instructions::Seize>, amount: u64) -> Result<()> {
        instructions::seize::handler(ctx, amount)
    }

    pub fn grant_role(ctx: Context<instructions::GrantRole>, role: state::Role) -> Result<()> {
        instructions::manage_roles::grant_handler(ctx, role)
    }

    pub fn revoke_role(ctx: Context<instructions::RevokeRole>) -> Result<()> {
        instructions::manage_roles::revoke_handler(ctx)
    }

    pub fn update_supply_cap(ctx: Context<instructions::UpdateConfig>, new_cap: Option<u64>) -> Result<()> {
        instructions::update_config::update_supply_cap_handler(ctx, new_cap)
    }
}
```

**Step 9: Verify it compiles (skeleton only — instructions are stubs)**

```bash
anchor build 2>&1 | head -20
```

Expected: Compilation errors for missing instructions. That's fine — we build those next.

**Step 10: Commit state definitions**

```bash
git add programs/sss-core/
git commit -m "feat(sss-core): add state definitions, errors, events, and constants"
```

---

### Task 1.2: Initialize Instruction

**Files:**
- Create: `programs/sss-core/src/instructions/initialize.rs`
- Create: `programs/sss-core/src/instructions/mod.rs`

**Step 1: Create instructions/initialize.rs**

This instruction:
1. Creates the `StablecoinConfig` PDA
2. Creates the Token-2022 mint with appropriate extensions based on preset
3. Grants the initial admin role to the caller

```rust
use anchor_lang::prelude::*;
use anchor_spl::token_interface::{Mint, TokenInterface};

use crate::constants::*;
use crate::error::SssError;
use crate::events::*;
use crate::state::*;

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct InitializeArgs {
    pub preset: u8,
    pub name: String,
    pub symbol: String,
    pub uri: String,
    pub decimals: u8,
    pub supply_cap: Option<u64>,
}

#[derive(Accounts)]
#[instruction(args: InitializeArgs)]
pub struct Initialize<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        init,
        payer = authority,
        space = CONFIG_SPACE,
        seeds = [SSS_CONFIG_SEED, mint.key().as_ref()],
        bump,
    )]
    pub config: Account<'info, StablecoinConfig>,

    /// The Token-2022 mint — created externally (via SDK) with the right extensions,
    /// then passed here for config registration. Mint authority = config PDA.
    #[account(
        mint::token_program = token_program,
    )]
    pub mint: InterfaceAccount<'info, Mint>,

    #[account(
        init,
        payer = authority,
        space = ROLE_SPACE,
        seeds = [SSS_ROLE_SEED, config.key().as_ref(), authority.key().as_ref(), &[Role::Admin.as_u8()]],
        bump,
    )]
    pub admin_role: Account<'info, RoleAccount>,

    pub token_program: Interface<'info, TokenInterface>,
    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<Initialize>, args: InitializeArgs) -> Result<()> {
    require!(args.preset >= 1 && args.preset <= 3, SssError::InvalidPreset);

    let config = &mut ctx.accounts.config;
    config.authority = ctx.accounts.authority.key();
    config.mint = ctx.accounts.mint.key();
    config.preset = args.preset;
    config.paused = false;
    config.supply_cap = args.supply_cap;
    config.total_minted = 0;
    config.total_burned = 0;
    config.bump = ctx.bumps.config;
    config._reserved = vec![0u8; 64];

    let admin_role = &mut ctx.accounts.admin_role;
    admin_role.config = config.key();
    admin_role.address = ctx.accounts.authority.key();
    admin_role.role = Role::Admin;
    admin_role.granted_by = ctx.accounts.authority.key();
    admin_role.granted_at = Clock::get()?.unix_timestamp;
    admin_role.bump = ctx.bumps.admin_role;

    emit!(StablecoinInitialized {
        mint: config.mint,
        authority: config.authority,
        preset: config.preset,
        supply_cap: config.supply_cap,
    });

    Ok(())
}
```

> **Design decision:** The mint is created externally by the SDK (which adds the right Token-2022 extensions per preset) and passed to this instruction. The program just registers the config. This keeps the on-chain program simple and lets the SDK handle extension composition.

**Step 2: Create instructions/mod.rs (add as we go)**

```rust
pub mod initialize;

pub use initialize::*;
```

**Step 3: Verify it compiles**

```bash
anchor build -p sss-core 2>&1 | tail -5
```

Expected: Should compile (with warnings about unused modules — that's OK).

**Step 4: Commit**

```bash
git add programs/sss-core/src/instructions/
git commit -m "feat(sss-core): add initialize instruction"
```

---

### Task 1.3: Mint Tokens Instruction

**Files:**
- Create: `programs/sss-core/src/instructions/mint_tokens.rs`
- Modify: `programs/sss-core/src/instructions/mod.rs`

**Step 1: Create mint_tokens.rs**

```rust
use anchor_lang::prelude::*;
use anchor_spl::token_interface::{self, Mint, MintTo, TokenAccount, TokenInterface};

use crate::constants::*;
use crate::error::SssError;
use crate::events::*;
use crate::state::*;

#[derive(Accounts)]
pub struct MintTokens<'info> {
    pub minter: Signer<'info>,

    #[account(
        mut,
        seeds = [SSS_CONFIG_SEED, mint.key().as_ref()],
        bump = config.bump,
        constraint = !config.paused @ SssError::Paused,
    )]
    pub config: Account<'info, StablecoinConfig>,

    #[account(
        seeds = [SSS_ROLE_SEED, config.key().as_ref(), minter.key().as_ref(), &[Role::Minter.as_u8()]],
        bump = minter_role.bump,
    )]
    pub minter_role: Account<'info, RoleAccount>,

    #[account(
        mut,
        mint::token_program = token_program,
    )]
    pub mint: InterfaceAccount<'info, Mint>,

    #[account(
        mut,
        token::mint = mint,
        token::token_program = token_program,
    )]
    pub to: InterfaceAccount<'info, TokenAccount>,

    pub token_program: Interface<'info, TokenInterface>,
}

pub fn handler(ctx: Context<MintTokens>, amount: u64) -> Result<()> {
    require!(amount > 0, SssError::ZeroAmount);

    let config = &mut ctx.accounts.config;
    require!(config.can_mint(amount), SssError::SupplyCapExceeded);

    config.total_minted = config.total_minted
        .checked_add(amount)
        .ok_or(SssError::ArithmeticOverflow)?;

    // CPI to Token-2022: mint tokens using config PDA as mint authority
    let mint_key = ctx.accounts.mint.key();
    let seeds = &[
        SSS_CONFIG_SEED,
        mint_key.as_ref(),
        &[config.bump],
    ];
    let signer_seeds = &[&seeds[..]];

    token_interface::mint_to(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            MintTo {
                mint: ctx.accounts.mint.to_account_info(),
                to: ctx.accounts.to.to_account_info(),
                authority: config.to_account_info(),
            },
            signer_seeds,
        ),
        amount,
    )?;

    emit!(TokensMinted {
        mint: ctx.accounts.mint.key(),
        to: ctx.accounts.to.key(),
        amount,
        minter: ctx.accounts.minter.key(),
        new_supply: config.current_supply(),
    });

    Ok(())
}
```

**Step 2: Add to mod.rs, verify compile, commit**

```bash
anchor build -p sss-core 2>&1 | tail -5
git add programs/sss-core/src/instructions/
git commit -m "feat(sss-core): add mint_tokens instruction with role check and supply cap"
```

---

### Task 1.4: Burn Tokens Instruction

**Files:**
- Create: `programs/sss-core/src/instructions/burn_tokens.rs`
- Modify: `programs/sss-core/src/instructions/mod.rs`

**Step 1: Create burn_tokens.rs**

```rust
use anchor_lang::prelude::*;
use anchor_spl::token_interface::{self, Burn, Mint, TokenAccount, TokenInterface};

use crate::constants::*;
use crate::error::SssError;
use crate::events::*;
use crate::state::*;

#[derive(Accounts)]
pub struct BurnTokens<'info> {
    pub burner: Signer<'info>,

    #[account(
        mut,
        seeds = [SSS_CONFIG_SEED, mint.key().as_ref()],
        bump = config.bump,
        constraint = !config.paused @ SssError::Paused,
    )]
    pub config: Account<'info, StablecoinConfig>,

    #[account(
        seeds = [SSS_ROLE_SEED, config.key().as_ref(), burner.key().as_ref(), &[Role::Minter.as_u8()]],
        bump = burner_role.bump,
    )]
    pub burner_role: Account<'info, RoleAccount>,

    #[account(
        mut,
        mint::token_program = token_program,
    )]
    pub mint: InterfaceAccount<'info, Mint>,

    #[account(
        mut,
        token::mint = mint,
        token::token_program = token_program,
    )]
    pub from: InterfaceAccount<'info, TokenAccount>,

    pub token_program: Interface<'info, TokenInterface>,
}

pub fn handler(ctx: Context<BurnTokens>, amount: u64) -> Result<()> {
    require!(amount > 0, SssError::ZeroAmount);

    let config = &mut ctx.accounts.config;
    config.total_burned = config.total_burned
        .checked_add(amount)
        .ok_or(SssError::ArithmeticOverflow)?;

    let mint_key = ctx.accounts.mint.key();
    let seeds = &[
        SSS_CONFIG_SEED,
        mint_key.as_ref(),
        &[config.bump],
    ];
    let signer_seeds = &[&seeds[..]];

    // Burn using config PDA as authority (requires config PDA to be token account authority
    // or use permanent delegate). If the burner holds the tokens, they sign directly.
    // Design: Minter role can burn from any account via permanent delegate
    token_interface::burn(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            Burn {
                mint: ctx.accounts.mint.to_account_info(),
                from: ctx.accounts.from.to_account_info(),
                authority: config.to_account_info(),
            },
            signer_seeds,
        ),
        amount,
    )?;

    emit!(TokensBurned {
        mint: ctx.accounts.mint.key(),
        from: ctx.accounts.from.key(),
        amount,
        burner: ctx.accounts.burner.key(),
        new_supply: config.current_supply(),
    });

    Ok(())
}
```

> **Note:** Burn uses the config PDA as authority via permanent delegate. The SDK must set the config PDA as permanent delegate on the mint during creation.

**Step 2: Add to mod.rs, verify compile, commit**

---

### Task 1.5: Freeze / Thaw Instructions

**Files:**
- Create: `programs/sss-core/src/instructions/freeze_account.rs`
- Create: `programs/sss-core/src/instructions/thaw_account.rs`

**Step 1: Create freeze_account.rs**

```rust
use anchor_lang::prelude::*;
use anchor_spl::token_interface::{self, FreezeAccount as FreezeAccountCpi, Mint, TokenAccount, TokenInterface};

use crate::constants::*;
use crate::error::SssError;
use crate::events::*;
use crate::state::*;

#[derive(Accounts)]
pub struct FreezeAccount<'info> {
    pub freezer: Signer<'info>,

    #[account(
        seeds = [SSS_CONFIG_SEED, mint.key().as_ref()],
        bump = config.bump,
        constraint = !config.paused @ SssError::Paused,
    )]
    pub config: Account<'info, StablecoinConfig>,

    #[account(
        seeds = [SSS_ROLE_SEED, config.key().as_ref(), freezer.key().as_ref(), &[Role::Freezer.as_u8()]],
        bump = freezer_role.bump,
    )]
    pub freezer_role: Account<'info, RoleAccount>,

    #[account(mint::token_program = token_program)]
    pub mint: InterfaceAccount<'info, Mint>,

    #[account(
        mut,
        token::mint = mint,
        token::token_program = token_program,
    )]
    pub token_account: InterfaceAccount<'info, TokenAccount>,

    pub token_program: Interface<'info, TokenInterface>,
}

pub fn handler(ctx: Context<FreezeAccount>) -> Result<()> {
    let mint_key = ctx.accounts.mint.key();
    let seeds = &[SSS_CONFIG_SEED, mint_key.as_ref(), &[ctx.accounts.config.bump]];
    let signer_seeds = &[&seeds[..]];

    token_interface::freeze_account(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            FreezeAccountCpi {
                account: ctx.accounts.token_account.to_account_info(),
                mint: ctx.accounts.mint.to_account_info(),
                authority: ctx.accounts.config.to_account_info(),
            },
            signer_seeds,
        ),
    )?;

    emit!(AccountFrozen {
        mint: ctx.accounts.mint.key(),
        account: ctx.accounts.token_account.key(),
        freezer: ctx.accounts.freezer.key(),
    });

    Ok(())
}
```

**Step 2: Create thaw_account.rs** (mirror of freeze with `thaw_account` CPI)

Same pattern, opposite CPI call (`token_interface::thaw_account`), emit `AccountThawed`.

**Step 3: Add to mod.rs, verify compile, commit**

---

### Task 1.6: Pause / Unpause Instructions

**Files:**
- Create: `programs/sss-core/src/instructions/pause.rs`
- Create: `programs/sss-core/src/instructions/unpause.rs`

**Step 1: Create pause.rs**

```rust
use anchor_lang::prelude::*;

use crate::constants::*;
use crate::error::SssError;
use crate::events::*;
use crate::state::*;

#[derive(Accounts)]
pub struct Pause<'info> {
    pub pauser: Signer<'info>,

    #[account(
        mut,
        seeds = [SSS_CONFIG_SEED, config.mint.as_ref()],
        bump = config.bump,
        constraint = !config.paused @ SssError::Paused,
    )]
    pub config: Account<'info, StablecoinConfig>,

    #[account(
        seeds = [SSS_ROLE_SEED, config.key().as_ref(), pauser.key().as_ref(), &[Role::Pauser.as_u8()]],
        bump = pauser_role.bump,
    )]
    pub pauser_role: Account<'info, RoleAccount>,
}

pub fn handler(ctx: Context<Pause>) -> Result<()> {
    ctx.accounts.config.paused = true;

    emit!(OperationsPaused {
        mint: ctx.accounts.config.mint,
        pauser: ctx.accounts.pauser.key(),
    });

    Ok(())
}
```

**Step 2: Create unpause.rs** — same pattern, `constraint = config.paused @ SssError::NotPaused`, sets `paused = false`.

**Step 3: Add to mod.rs, verify compile, commit**

---

### Task 1.7: Seize Instruction (Permanent Delegate)

**Files:**
- Create: `programs/sss-core/src/instructions/seize.rs`

**Step 1: Create seize.rs**

Uses Token-2022's permanent delegate to transfer tokens from one account to another without the owner's consent. Only admin role.

```rust
use anchor_lang::prelude::*;
use anchor_spl::token_interface::{self, Mint, TokenAccount, TokenInterface, TransferChecked};

use crate::constants::*;
use crate::error::SssError;
use crate::events::*;
use crate::state::*;

#[derive(Accounts)]
pub struct Seize<'info> {
    pub admin: Signer<'info>,

    #[account(
        seeds = [SSS_CONFIG_SEED, mint.key().as_ref()],
        bump = config.bump,
    )]
    pub config: Account<'info, StablecoinConfig>,

    #[account(
        seeds = [SSS_ROLE_SEED, config.key().as_ref(), admin.key().as_ref(), &[Role::Admin.as_u8()]],
        bump = admin_role.bump,
    )]
    pub admin_role: Account<'info, RoleAccount>,

    #[account(mint::token_program = token_program)]
    pub mint: InterfaceAccount<'info, Mint>,

    #[account(
        mut,
        token::mint = mint,
        token::token_program = token_program,
    )]
    pub from: InterfaceAccount<'info, TokenAccount>,

    #[account(
        mut,
        token::mint = mint,
        token::token_program = token_program,
    )]
    pub to: InterfaceAccount<'info, TokenAccount>,

    pub token_program: Interface<'info, TokenInterface>,
}

pub fn handler(ctx: Context<Seize>, amount: u64) -> Result<()> {
    require!(amount > 0, SssError::ZeroAmount);

    let mint_key = ctx.accounts.mint.key();
    let seeds = &[SSS_CONFIG_SEED, mint_key.as_ref(), &[ctx.accounts.config.bump]];
    let signer_seeds = &[&seeds[..]];

    // Transfer using permanent delegate authority (config PDA)
    token_interface::transfer_checked(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            TransferChecked {
                from: ctx.accounts.from.to_account_info(),
                mint: ctx.accounts.mint.to_account_info(),
                to: ctx.accounts.to.to_account_info(),
                authority: ctx.accounts.config.to_account_info(),
            },
            signer_seeds,
        ),
        amount,
        ctx.accounts.mint.decimals,
    )?;

    emit!(TokensSeized {
        mint: ctx.accounts.mint.key(),
        from: ctx.accounts.from.key(),
        to: ctx.accounts.to.key(),
        amount,
        seizer: ctx.accounts.admin.key(),
    });

    Ok(())
}
```

**Step 2: Add to mod.rs, verify compile, commit**

---

### Task 1.8: Role Management Instructions

**Files:**
- Create: `programs/sss-core/src/instructions/manage_roles.rs`

**Step 1: Create manage_roles.rs**

```rust
use anchor_lang::prelude::*;

use crate::constants::*;
use crate::events::*;
use crate::state::*;

#[derive(Accounts)]
#[instruction(role: Role)]
pub struct GrantRole<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,

    #[account(
        seeds = [SSS_CONFIG_SEED, config.mint.as_ref()],
        bump = config.bump,
    )]
    pub config: Account<'info, StablecoinConfig>,

    #[account(
        seeds = [SSS_ROLE_SEED, config.key().as_ref(), admin.key().as_ref(), &[Role::Admin.as_u8()]],
        bump = admin_role.bump,
    )]
    pub admin_role: Account<'info, RoleAccount>,

    /// CHECK: The address to grant the role to
    pub grantee: UncheckedAccount<'info>,

    #[account(
        init,
        payer = admin,
        space = ROLE_SPACE,
        seeds = [SSS_ROLE_SEED, config.key().as_ref(), grantee.key().as_ref(), &[role.as_u8()]],
        bump,
    )]
    pub role_account: Account<'info, RoleAccount>,

    pub system_program: Program<'info, System>,
}

pub fn grant_handler(ctx: Context<GrantRole>, role: Role) -> Result<()> {
    let role_account = &mut ctx.accounts.role_account;
    role_account.config = ctx.accounts.config.key();
    role_account.address = ctx.accounts.grantee.key();
    role_account.role = role;
    role_account.granted_by = ctx.accounts.admin.key();
    role_account.granted_at = Clock::get()?.unix_timestamp;
    role_account.bump = ctx.bumps.role_account;

    emit!(RoleGranted {
        config: ctx.accounts.config.key(),
        address: ctx.accounts.grantee.key(),
        role: role.as_u8(),
        granted_by: ctx.accounts.admin.key(),
    });

    Ok(())
}

#[derive(Accounts)]
pub struct RevokeRole<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,

    #[account(
        seeds = [SSS_CONFIG_SEED, config.mint.as_ref()],
        bump = config.bump,
    )]
    pub config: Account<'info, StablecoinConfig>,

    #[account(
        seeds = [SSS_ROLE_SEED, config.key().as_ref(), admin.key().as_ref(), &[Role::Admin.as_u8()]],
        bump = admin_role.bump,
    )]
    pub admin_role: Account<'info, RoleAccount>,

    #[account(
        mut,
        close = admin,
        seeds = [SSS_ROLE_SEED, config.key().as_ref(), role_account.address.as_ref(), &[role_account.role.as_u8()]],
        bump = role_account.bump,
    )]
    pub role_account: Account<'info, RoleAccount>,
}

pub fn revoke_handler(ctx: Context<RevokeRole>) -> Result<()> {
    emit!(RoleRevoked {
        config: ctx.accounts.config.key(),
        address: ctx.accounts.role_account.address,
        role: ctx.accounts.role_account.role.as_u8(),
        revoked_by: ctx.accounts.admin.key(),
    });

    // Account is closed via `close = admin` constraint
    Ok(())
}
```

**Step 2: Add to mod.rs, verify compile, commit**

---

### Task 1.9: Update Config Instruction

**Files:**
- Create: `programs/sss-core/src/instructions/update_config.rs`

**Step 1: Create update_config.rs**

```rust
use anchor_lang::prelude::*;

use crate::constants::*;
use crate::error::SssError;
use crate::events::*;
use crate::state::*;

#[derive(Accounts)]
pub struct UpdateConfig<'info> {
    pub admin: Signer<'info>,

    #[account(
        mut,
        seeds = [SSS_CONFIG_SEED, config.mint.as_ref()],
        bump = config.bump,
    )]
    pub config: Account<'info, StablecoinConfig>,

    #[account(
        seeds = [SSS_ROLE_SEED, config.key().as_ref(), admin.key().as_ref(), &[Role::Admin.as_u8()]],
        bump = admin_role.bump,
    )]
    pub admin_role: Account<'info, RoleAccount>,
}

pub fn update_supply_cap_handler(ctx: Context<UpdateConfig>, new_cap: Option<u64>) -> Result<()> {
    let config = &mut ctx.accounts.config;

    // If setting a cap, it must be >= current supply
    if let Some(cap) = new_cap {
        require!(cap >= config.current_supply(), SssError::InvalidSupplyCap);
    }

    config.supply_cap = new_cap;

    emit!(ConfigUpdated {
        config: config.key(),
        field: "supply_cap".to_string(),
        updater: ctx.accounts.admin.key(),
    });

    Ok(())
}
```

**Step 2: Add to mod.rs, verify full build, commit**

```bash
anchor build -p sss-core
git add programs/sss-core/
git commit -m "feat(sss-core): complete all instructions (init, mint, burn, freeze, thaw, pause, seize, roles, config)"
```

---

### Task 1.10: sss-core Rust Unit Tests

**Files:**
- Modify: `programs/sss-core/src/state/config.rs` (add tests module)

**Step 1: Add unit tests to config.rs**

```rust
#[cfg(test)]
mod tests {
    use super::*;

    fn make_config(minted: u64, burned: u64, cap: Option<u64>) -> StablecoinConfig {
        StablecoinConfig {
            authority: Pubkey::default(),
            mint: Pubkey::default(),
            preset: 1,
            paused: false,
            supply_cap: cap,
            total_minted: minted,
            total_burned: burned,
            bump: 0,
            _reserved: vec![0u8; 64],
        }
    }

    #[test]
    fn test_current_supply() {
        let config = make_config(1000, 300, None);
        assert_eq!(config.current_supply(), 700);
    }

    #[test]
    fn test_can_mint_no_cap() {
        let config = make_config(1000, 0, None);
        assert!(config.can_mint(u64::MAX - 1000));
        assert!(!config.can_mint(u64::MAX)); // overflow
    }

    #[test]
    fn test_can_mint_with_cap() {
        let config = make_config(500, 100, Some(1000));
        // current supply = 400, cap = 1000
        assert!(config.can_mint(600)); // 400 + 600 = 1000 ✓
        assert!(!config.can_mint(601)); // 400 + 601 = 1001 ✗
    }

    #[test]
    fn test_can_mint_zero() {
        let config = make_config(0, 0, Some(100));
        assert!(config.can_mint(0));
        assert!(config.can_mint(100));
        assert!(!config.can_mint(101));
    }
}
```

**Step 2: Run tests**

```bash
cargo test -p sss-core
```

Expected: All tests pass.

**Step 3: Commit**

```bash
git add programs/sss-core/
git commit -m "test(sss-core): add unit tests for StablecoinConfig state logic"
```

---

## Phase 2: sss-transfer-hook Program

### Task 2.1: Transfer Hook Program

**Files:**
- Create: `programs/sss-transfer-hook/Cargo.toml`
- Create: `programs/sss-transfer-hook/src/lib.rs`
- Create: `programs/sss-transfer-hook/src/state/mod.rs`
- Create: `programs/sss-transfer-hook/src/state/blacklist.rs`
- Create: `programs/sss-transfer-hook/src/instructions/mod.rs`
- Create: `programs/sss-transfer-hook/src/instructions/initialize.rs`
- Create: `programs/sss-transfer-hook/src/instructions/transfer_hook.rs`
- Create: `programs/sss-transfer-hook/src/instructions/add_to_blacklist.rs`
- Create: `programs/sss-transfer-hook/src/instructions/remove_from_blacklist.rs`
- Create: `programs/sss-transfer-hook/src/error.rs`
- Create: `programs/sss-transfer-hook/src/constants.rs`

**Step 1: Create Cargo.toml**

```toml
[package]
name = "sss-transfer-hook"
version = "0.1.0"
description = "Solana Stablecoin Standard - Transfer Hook Program"
edition = "2021"

[lib]
crate-type = ["cdylib", "lib"]
name = "sss_transfer_hook"

[features]
no-entrypoint = []
no-idl = []
no-log-ix-name = []
cpi = ["no-entrypoint"]
default = []
idl-build = ["anchor-lang/idl-build", "anchor-spl/idl-build"]

[dependencies]
anchor-lang = { workspace = true }
anchor-spl = { workspace = true }
spl-transfer-hook-interface = { workspace = true }
spl-tlv-account-resolution = "0.9"
```

**Step 2: Create state/blacklist.rs**

```rust
use anchor_lang::prelude::*;

#[account]
pub struct BlacklistEntry {
    pub mint: Pubkey,
    pub address: Pubkey,
    pub added_by: Pubkey,
    pub added_at: i64,
    pub reason: String,     // max 128 chars
    pub bump: u8,
}

pub const BLACKLIST_SPACE: usize = 8 + 32 + 32 + 32 + 8 + (4 + 128) + 1;
```

**Step 3: Create the full hook program**

The transfer hook program implements the `spl_transfer_hook_interface::instruction::ExecuteInstruction` interface. Key points:
- `initialize`: Creates the `ExtraAccountMetaList` account that tells Token-2022 what extra accounts the hook needs
- `transfer_hook`: Called by Token-2022 on every transfer — checks if sender or receiver is blacklisted
- `add_to_blacklist` / `remove_from_blacklist`: Admin-only blacklist management (checks role via sss-core CPI or passed role PDA)

```rust
// lib.rs — thin program module
use anchor_lang::prelude::*;
use anchor_spl::token_interface::spl_token_2022::extension::transfer_hook::TransferHookAccount;

pub mod constants;
pub mod error;
pub mod instructions;
pub mod state;

declare_id!("REPLACE_WITH_GENERATED_HOOK_KEYPAIR");

#[program]
pub mod sss_transfer_hook {
    use super::*;

    pub fn initialize_extra_account_metas(
        ctx: Context<instructions::InitializeExtraAccountMetas>,
    ) -> Result<()> {
        instructions::initialize::handler(ctx)
    }

    pub fn transfer_hook(ctx: Context<instructions::TransferHook>, amount: u64) -> Result<()> {
        instructions::transfer_hook::handler(ctx, amount)
    }

    pub fn add_to_blacklist(
        ctx: Context<instructions::AddToBlacklist>,
        reason: String,
    ) -> Result<()> {
        instructions::add_to_blacklist::handler(ctx, reason)
    }

    pub fn remove_from_blacklist(ctx: Context<instructions::RemoveFromBlacklist>) -> Result<()> {
        instructions::remove_from_blacklist::handler(ctx)
    }

    // Required by the transfer hook interface — fallback instruction
    pub fn fallback<'info>(
        program_id: &Pubkey,
        accounts: &'info [AccountInfo<'info>],
        data: &[u8],
    ) -> Result<()> {
        let instruction = spl_transfer_hook_interface::instruction::TransferHookInstruction::unpack(data)?;

        match instruction {
            spl_transfer_hook_interface::instruction::TransferHookInstruction::Execute { amount } => {
                let amount_bytes = amount.to_le_bytes();
                __private::__global::transfer_hook(program_id, accounts, &amount_bytes)
            }
            _ => Err(ProgramError::InvalidInstructionData.into()),
        }
    }
}
```

> **Critical:** The `fallback` function is how Token-2022 invokes the hook. It unpacks the transfer hook interface instruction and delegates to our `transfer_hook` handler.

**Step 4: Create initialize.rs (ExtraAccountMetaList)**

```rust
use anchor_lang::prelude::*;
use anchor_lang::system_program;
use anchor_spl::token_interface::Mint;
use spl_tlv_account_resolution::{account::ExtraAccountMeta, state::ExtraAccountMetaList};
use spl_transfer_hook_interface::instruction::ExecuteInstruction;

use crate::constants::*;

#[derive(Accounts)]
pub struct InitializeExtraAccountMetas<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    /// CHECK: ExtraAccountMetaList PDA — validated by seeds
    #[account(
        mut,
        seeds = [b"extra-account-metas", mint.key().as_ref()],
        bump,
    )]
    pub extra_account_metas: UncheckedAccount<'info>,

    pub mint: InterfaceAccount<'info, Mint>,
    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<InitializeExtraAccountMetas>) -> Result<()> {
    // Define extra accounts the hook needs:
    // 1. Sender blacklist PDA (may or may not exist)
    // 2. Receiver blacklist PDA (may or may not exist)
    let extra_metas = vec![
        // Sender blacklist: seeds = ["blacklist", mint, source_owner]
        ExtraAccountMeta::new_external_pda_with_seeds(
            5, // index: our program
            &[
                spl_tlv_account_resolution::seeds::Seed::Literal { bytes: BLACKLIST_SEED.to_vec() },
                spl_tlv_account_resolution::seeds::Seed::AccountKey { index: 1 }, // mint
                spl_tlv_account_resolution::seeds::Seed::AccountKey { index: 3 }, // source authority/owner
            ],
            false, // not signer
            false, // not writable
        )?,
        // Receiver blacklist: seeds = ["blacklist", mint, destination_owner]
        // Note: In transfer_hook, accounts[4] is destination token account, not owner.
        // We need the destination authority which requires resolving from the token account.
        // Alternative: use AccountData seed to extract owner from destination token account.
        ExtraAccountMeta::new_external_pda_with_seeds(
            5,
            &[
                spl_tlv_account_resolution::seeds::Seed::Literal { bytes: BLACKLIST_SEED.to_vec() },
                spl_tlv_account_resolution::seeds::Seed::AccountKey { index: 1 }, // mint
                spl_tlv_account_resolution::seeds::Seed::AccountData {
                    account_index: 4, // destination token account
                    data_index: 32,   // offset to owner field in token account
                    length: 32,       // Pubkey size
                },
            ],
            false,
            false,
        )?,
    ];

    let account_size = ExtraAccountMetaList::size_of(extra_metas.len())?;
    let lamports = Rent::get()?.minimum_balance(account_size);

    let mint_key = ctx.accounts.mint.key();
    let seeds = &[b"extra-account-metas", mint_key.as_ref(), &[ctx.bumps.extra_account_metas]];
    let signer_seeds = &[&seeds[..]];

    // Create the account
    system_program::create_account(
        CpiContext::new_with_signer(
            ctx.accounts.system_program.to_account_info(),
            system_program::CreateAccount {
                from: ctx.accounts.payer.to_account_info(),
                to: ctx.accounts.extra_account_metas.to_account_info(),
            },
            signer_seeds,
        ),
        lamports,
        account_size as u64,
        &crate::id(),
    )?;

    ExtraAccountMetaList::init::<ExecuteInstruction>(
        &mut ctx.accounts.extra_account_metas.try_borrow_mut_data()?,
        &extra_metas,
    )?;

    Ok(())
}
```

> **Note:** The ExtraAccountMetaList is how Token-2022 knows which additional accounts to pass to the hook during transfers. The sender and receiver blacklist PDAs are resolved dynamically.

**Step 5: Create transfer_hook.rs**

```rust
use anchor_lang::prelude::*;
use anchor_spl::token_interface::TokenAccount;

use crate::error::TransferHookError;

#[derive(Accounts)]
pub struct TransferHook<'info> {
    /// CHECK: Source token account
    pub source: UncheckedAccount<'info>,
    pub mint: UncheckedAccount<'info>,
    /// CHECK: Destination token account
    pub destination: UncheckedAccount<'info>,
    /// CHECK: Source authority
    pub authority: UncheckedAccount<'info>,
    /// CHECK: ExtraAccountMetaList
    pub extra_account_metas: UncheckedAccount<'info>,

    /// CHECK: Sender blacklist PDA — if account exists and has data, sender is blacklisted
    pub sender_blacklist: UncheckedAccount<'info>,
    /// CHECK: Receiver blacklist PDA — if account exists and has data, receiver is blacklisted
    pub receiver_blacklist: UncheckedAccount<'info>,
}

pub fn handler(ctx: Context<TransferHook>, _amount: u64) -> Result<()> {
    // Check if sender is blacklisted (PDA exists and has data)
    let sender_bl = &ctx.accounts.sender_blacklist;
    if sender_bl.data_len() > 0 && sender_bl.owner == &crate::id() {
        return Err(TransferHookError::SenderBlacklisted.into());
    }

    // Check if receiver is blacklisted
    let receiver_bl = &ctx.accounts.receiver_blacklist;
    if receiver_bl.data_len() > 0 && receiver_bl.owner == &crate::id() {
        return Err(TransferHookError::ReceiverBlacklisted.into());
    }

    Ok(())
}
```

**Step 6: Create add_to_blacklist.rs and remove_from_blacklist.rs**

```rust
// add_to_blacklist.rs
use anchor_lang::prelude::*;

use crate::constants::*;
use crate::error::TransferHookError;
use crate::state::*;

#[derive(Accounts)]
pub struct AddToBlacklist<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    /// CHECK: The sss-core config PDA, verified by seeds against the mint
    pub sss_config: UncheckedAccount<'info>,

    /// CHECK: The admin role PDA from sss-core, proving the signer is admin.
    /// Verified by checking: owner == sss_core program, and seeds match.
    pub admin_role: UncheckedAccount<'info>,

    pub mint: UncheckedAccount<'info>,

    /// CHECK: Address to blacklist
    pub address: UncheckedAccount<'info>,

    #[account(
        init,
        payer = authority,
        space = BLACKLIST_SPACE,
        seeds = [BLACKLIST_SEED, mint.key().as_ref(), address.key().as_ref()],
        bump,
    )]
    pub blacklist_entry: Account<'info, BlacklistEntry>,

    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<AddToBlacklist>, reason: String) -> Result<()> {
    require!(reason.len() <= MAX_REASON_LEN, TransferHookError::ReasonTooLong);

    // TODO: Verify admin_role PDA is valid (check owner == sss_core::ID and seeds derivation)
    // This cross-program role verification is critical for security.

    let entry = &mut ctx.accounts.blacklist_entry;
    entry.mint = ctx.accounts.mint.key();
    entry.address = ctx.accounts.address.key();
    entry.added_by = ctx.accounts.authority.key();
    entry.added_at = Clock::get()?.unix_timestamp;
    entry.reason = reason;
    entry.bump = ctx.bumps.blacklist_entry;

    Ok(())
}
```

```rust
// remove_from_blacklist.rs
use anchor_lang::prelude::*;

use crate::constants::*;
use crate::state::*;

#[derive(Accounts)]
pub struct RemoveFromBlacklist<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    /// CHECK: admin role PDA from sss-core
    pub admin_role: UncheckedAccount<'info>,

    pub mint: UncheckedAccount<'info>,

    #[account(
        mut,
        close = authority,
        seeds = [BLACKLIST_SEED, mint.key().as_ref(), blacklist_entry.address.as_ref()],
        bump = blacklist_entry.bump,
    )]
    pub blacklist_entry: Account<'info, BlacklistEntry>,
}

pub fn handler(ctx: Context<RemoveFromBlacklist>) -> Result<()> {
    // Account closed via `close = authority`
    Ok(())
}
```

**Step 7: Create error.rs and constants.rs**

```rust
// error.rs
use anchor_lang::prelude::*;

#[error_code]
pub enum TransferHookError {
    #[msg("Sender is blacklisted")]
    SenderBlacklisted,
    #[msg("Receiver is blacklisted")]
    ReceiverBlacklisted,
    #[msg("Reason exceeds maximum length")]
    ReasonTooLong,
    #[msg("Unauthorized: not an admin")]
    Unauthorized,
}

// constants.rs
pub const BLACKLIST_SEED: &[u8] = b"blacklist";
pub const MAX_REASON_LEN: usize = 128;
```

**Step 8: Build both programs**

```bash
anchor build
```

Expected: Both programs compile.

**Step 9: Commit**

```bash
git add programs/sss-transfer-hook/
git commit -m "feat(sss-transfer-hook): complete transfer hook program with blacklist enforcement"
```

---

## Phase 3: Integration Tests

### Task 3.1: Test Setup & SSS-1 Lifecycle

**Files:**
- Create: `tests/package.json`
- Create: `tests/tsconfig.json`
- Create: `tests/helpers.ts` (shared test utilities)
- Create: `tests/sss-1.test.ts`

**Step 1: Set up test package**

```json
{
  "name": "sss-tests",
  "private": true,
  "scripts": {
    "test": "anchor test --skip-build"
  },
  "dependencies": {
    "@coral-xyz/anchor": "^0.32.0",
    "@solana/web3.js": "^1.98",
    "@solana/spl-token": "^0.4",
    "chai": "^5"
  },
  "devDependencies": {
    "@types/chai": "^5",
    "ts-mocha": "^12",
    "typescript": "^5.7"
  }
}
```

**Step 2: Create helpers.ts**

Shared utilities for all test files:
- `createTestMint(preset)` — creates Token-2022 mint with correct extensions per preset
- `airdrop(connection, pubkey)` — airdrop SOL
- `createTokenAccount(mint, owner)` — create ATA
- `deriveConfigPda(mint)` — derive config PDA
- `deriveRolePda(config, address, role)` — derive role PDA
- `deriveBlacklistPda(mint, address)` — derive blacklist PDA

**Step 3: Create sss-1.test.ts — full lifecycle**

Test flow:
1. Initialize SSS-1 mint (no transfer hook, no default frozen, basic metadata)
2. Grant minter role
3. Mint tokens → verify supply tracking
4. Burn tokens → verify supply tracking
5. Freeze/thaw account
6. Pause/unpause → verify ops blocked when paused
7. Update supply cap
8. Test supply cap enforcement
9. Revoke minter role → verify mint fails

**Step 4: Run tests**

```bash
anchor test
```

**Step 5: Commit**

```bash
git add tests/
git commit -m "test: add SSS-1 full lifecycle integration tests"
```

### Task 3.2: SSS-2 Lifecycle with Transfer Hook

**Files:**
- Create: `tests/sss-2.test.ts`

Test flow:
1. Initialize SSS-2 mint (with transfer hook extension pointing to sss-transfer-hook)
2. Initialize ExtraAccountMetaList
3. Grant roles (minter, freezer)
4. Mint tokens
5. Transfer tokens → should succeed (no blacklist entries)
6. Add address to blacklist
7. Transfer FROM blacklisted → should fail
8. Transfer TO blacklisted → should fail
9. Remove from blacklist → transfer should succeed again
10. Seize tokens (permanent delegate)
11. Default account state = frozen → new accounts need explicit thaw

**Step 2: Commit**

```bash
git add tests/sss-2.test.ts
git commit -m "test: add SSS-2 full lifecycle with transfer hook and blacklist"
```

### Task 3.3: Role Management & Edge Cases

**Files:**
- Create: `tests/roles.test.ts`
- Create: `tests/edge-cases.test.ts`
- Create: `tests/security.test.ts`

**roles.test.ts:**
- Grant all role types
- Verify each role can only do its allowed operations
- Revoke roles → verify operations fail
- Multiple admins
- Admin grants another admin

**edge-cases.test.ts:**
- Zero amount mint/burn → should fail
- Overflow amounts → should fail
- Double pause → should fail
- Double unpause → should fail
- Freeze already frozen → should fail
- Thaw not-frozen → should fail
- Mint at exactly supply cap → should succeed
- Mint one over supply cap → should fail

**security.test.ts:**
- Mint without minter role → should fail
- Freeze without freezer role → should fail
- Pause without pauser role → should fail
- Seize without admin role → should fail
- Grant role without admin role → should fail
- Blacklist management without admin → should fail
- Wrong config PDA → should fail
- Wrong mint → should fail

**Commit each test file separately.**

### Task 3.4: Transfer Hook Tests

**Files:**
- Create: `tests/transfer-hook.test.ts`

- Initialize hook with ExtraAccountMetas
- Normal transfer (no blacklist) → succeeds
- Blacklist sender → transfer fails
- Blacklist receiver → transfer fails
- Remove blacklist → transfer succeeds
- Multiple blacklist entries for different addresses

**Commit.**

---

## Phase 4: TypeScript SDK

### Task 4.1: SDK Scaffolding

**Files:**
- Create: `sdk/package.json`
- Create: `sdk/tsconfig.json`
- Create: `sdk/vitest.config.ts`
- Create: `sdk/src/index.ts`
- Create: `sdk/src/types.ts`
- Create: `sdk/src/errors.ts`
- Create: `sdk/src/pda.ts`

**Step 1: Create package.json**

```json
{
  "name": "@sss/sdk",
  "version": "0.1.0",
  "description": "Solana Stablecoin Standard SDK",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "scripts": {
    "build": "tsc",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "@coral-xyz/anchor": "^0.32.0",
    "@solana/web3.js": "^1.98",
    "@solana/spl-token": "^0.4"
  },
  "devDependencies": {
    "typescript": "^5.7",
    "vitest": "^3"
  }
}
```

**Step 2: Create types.ts**

```typescript
import { PublicKey } from "@solana/web3.js";

export type Preset = "sss-1" | "sss-2" | "sss-3";
export type RoleType = "admin" | "minter" | "freezer" | "pauser";

export interface StablecoinCreateOptions {
  preset: Preset;
  name: string;
  symbol: string;
  uri?: string;
  decimals?: number;
  supplyCap?: bigint;
}

export interface StablecoinInfo {
  mint: PublicKey;
  authority: PublicKey;
  preset: Preset;
  paused: boolean;
  supplyCap: bigint | null;
  totalMinted: bigint;
  totalBurned: bigint;
  currentSupply: bigint;
}

export interface RoleInfo {
  config: PublicKey;
  address: PublicKey;
  role: RoleType;
  grantedBy: PublicKey;
  grantedAt: Date;
}

export interface BlacklistInfo {
  mint: PublicKey;
  address: PublicKey;
  addedBy: PublicKey;
  addedAt: Date;
  reason: string;
}
```

**Step 3: Create pda.ts**

```typescript
import { PublicKey } from "@solana/web3.js";

const SSS_CONFIG_SEED = Buffer.from("sss-config");
const SSS_ROLE_SEED = Buffer.from("sss-role");
const BLACKLIST_SEED = Buffer.from("blacklist");
const EXTRA_ACCOUNT_METAS_SEED = Buffer.from("extra-account-metas");

const ROLE_MAP = { admin: 0, minter: 1, freezer: 2, pauser: 3 } as const;

export function deriveConfigPda(mint: PublicKey, programId: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [SSS_CONFIG_SEED, mint.toBuffer()],
    programId,
  );
}

export function deriveRolePda(
  config: PublicKey,
  address: PublicKey,
  role: keyof typeof ROLE_MAP,
  programId: PublicKey,
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [SSS_ROLE_SEED, config.toBuffer(), address.toBuffer(), Buffer.from([ROLE_MAP[role]])],
    programId,
  );
}

export function deriveBlacklistPda(
  mint: PublicKey,
  address: PublicKey,
  programId: PublicKey,
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [BLACKLIST_SEED, mint.toBuffer(), address.toBuffer()],
    programId,
  );
}

export function deriveExtraAccountMetasPda(
  mint: PublicKey,
  programId: PublicKey,
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [EXTRA_ACCOUNT_METAS_SEED, mint.toBuffer()],
    programId,
  );
}
```

**Step 4: Create pda.test.ts and verify**

```typescript
import { describe, it, expect } from "vitest";
import { PublicKey } from "@solana/web3.js";
import { deriveConfigPda, deriveRolePda, deriveBlacklistPda } from "../src/pda";

describe("PDA derivation", () => {
  const programId = new PublicKey("11111111111111111111111111111112");
  const mint = PublicKey.unique();

  it("derives config PDA deterministically", () => {
    const [pda1] = deriveConfigPda(mint, programId);
    const [pda2] = deriveConfigPda(mint, programId);
    expect(pda1.equals(pda2)).toBe(true);
  });

  it("derives different PDAs for different mints", () => {
    const mint2 = PublicKey.unique();
    const [pda1] = deriveConfigPda(mint, programId);
    const [pda2] = deriveConfigPda(mint2, programId);
    expect(pda1.equals(pda2)).toBe(false);
  });

  it("derives role PDA with correct role byte", () => {
    const config = PublicKey.unique();
    const address = PublicKey.unique();
    const [minterPda] = deriveRolePda(config, address, "minter", programId);
    const [freezerPda] = deriveRolePda(config, address, "freezer", programId);
    expect(minterPda.equals(freezerPda)).toBe(false);
  });
});
```

**Step 5: Run SDK tests**

```bash
cd sdk && pnpm test
```

**Step 6: Commit**

```bash
git add sdk/
git commit -m "feat(sdk): scaffolding with types, PDA helpers, and unit tests"
```

### Task 4.2: Instruction Builders

**Files:**
- Create: `sdk/src/instructions/core.ts`
- Create: `sdk/src/instructions/hook.ts`
- Create: `sdk/src/instructions/index.ts`

Build instruction builder functions that wrap the Anchor-generated IDL types. Each function returns a `TransactionInstruction` (or uses the Anchor `Program.methods` API).

Key builders:
- `buildInitializeIx(program, mint, authority, args)`
- `buildMintTokensIx(program, mint, minter, to, amount)`
- `buildBurnTokensIx(program, mint, burner, from, amount)`
- `buildFreezeAccountIx(program, mint, freezer, tokenAccount)`
- `buildThawAccountIx(program, mint, freezer, tokenAccount)`
- `buildPauseIx(program, mint, pauser)`
- `buildUnpauseIx(program, mint, pauser)`
- `buildSeizeIx(program, mint, admin, from, to, amount)`
- `buildGrantRoleIx(program, config, admin, grantee, role)`
- `buildRevokeRoleIx(program, config, admin, roleAccount)`
- `buildAddToBlacklistIx(hookProgram, mint, admin, address, reason)`
- `buildRemoveFromBlacklistIx(hookProgram, mint, admin, address)`

**Commit.**

### Task 4.3: Preset Config Builders

**Files:**
- Create: `sdk/src/presets/sss1.ts`
- Create: `sdk/src/presets/sss2.ts`
- Create: `sdk/src/presets/sss3.ts`
- Create: `sdk/src/presets/index.ts`

Each preset defines which Token-2022 extensions to enable on the mint:

**SSS-1 (Minimal):**
- MetadataPointer + TokenMetadata
- MintCloseAuthority (optional)

**SSS-2 (Compliant):**
- MetadataPointer + TokenMetadata
- TransferHook (pointing to sss-transfer-hook)
- PermanentDelegate (config PDA)
- DefaultAccountState (Frozen — KYC gating)

**SSS-3 (Private):**
- MetadataPointer + TokenMetadata
- ConfidentialTransferMint (with auditor key)
- PermanentDelegate (config PDA)

Each preset exports a `createMint(connection, payer, options)` function that:
1. Calculates total extension space
2. Creates the mint account with `SystemProgram.createAccount`
3. Initializes each extension in order
4. Initializes the mint
5. Returns the mint keypair

**Commit.**

### Task 4.4: Main SSS Client Class

**Files:**
- Create: `sdk/src/client.ts`

The `SSS` class is the main entry point:

```typescript
export class SSS {
  // Factory methods
  static async create(connection, wallet, options: StablecoinCreateOptions): Promise<SSS>;
  static async load(connection, wallet, mint: PublicKey): Promise<SSS>;

  // Universal operations
  async mint(recipient: PublicKey, amount: bigint): Promise<string>;
  async burn(from: PublicKey, amount: bigint): Promise<string>;
  async freeze(tokenAccount: PublicKey): Promise<string>;
  async thaw(tokenAccount: PublicKey): Promise<string>;
  async pause(): Promise<string>;
  async unpause(): Promise<string>;
  async seize(from: PublicKey, to: PublicKey, amount: bigint): Promise<string>;
  async info(): Promise<StablecoinInfo>;

  // Role management
  roles: {
    grant(address: PublicKey, role: RoleType): Promise<string>;
    revoke(address: PublicKey, role: RoleType): Promise<string>;
    check(address: PublicKey, role: RoleType): Promise<boolean>;
  };

  // SSS-2 compliance
  blacklist: {
    add(address: PublicKey, reason: string): Promise<string>;
    remove(address: PublicKey): Promise<string>;
    check(address: PublicKey): Promise<boolean>;
  };

  // SSS-3 confidential (Task 7.x)
  confidential: { ... };
}
```

**Commit.**

### Task 4.5: SDK Unit Tests

**Files:**
- Create: `sdk/tests/client.test.ts`
- Create: `sdk/tests/presets.test.ts`

Test the SDK with mocked Anchor programs (no on-chain interaction needed for unit tests). Integration testing is handled by Phase 3 tests.

**Commit.**

---

## Phase 5: Rust CLI

### Task 5.1: CLI Scaffolding

**Files:**
- Create: `cli/Cargo.toml`
- Create: `cli/src/main.rs`
- Create: `cli/src/commands/mod.rs`
- Create: `cli/src/config.rs`
- Create: `cli/src/utils.rs`

**Step 1: Create Cargo.toml**

```toml
[package]
name = "sss-cli"
version = "0.1.0"
edition = "2021"

[[bin]]
name = "sss"
path = "src/main.rs"

[dependencies]
anchor-client = "0.32.0"
anchor-lang = { workspace = true }
clap = { version = "4", features = ["derive"] }
solana-sdk = { workspace = true }
solana-client = { workspace = true }
spl-token-2022 = { workspace = true }
serde = { version = "1", features = ["derive"] }
serde_json = "1"
tokio = { version = "1", features = ["full"] }
anyhow = "1"
colored = "3"
dialoguer = "0.11"
indicatif = "0.17"
bs58 = "0.5"
```

**Step 2: Create main.rs with clap derive**

```rust
use clap::{Parser, Subcommand};

#[derive(Parser)]
#[command(name = "sss", about = "Solana Stablecoin Standard CLI")]
pub struct Cli {
    #[command(subcommand)]
    pub command: Commands,

    /// RPC URL (default: http://localhost:8899)
    #[arg(long, global = true, default_value = "http://localhost:8899")]
    pub rpc_url: String,

    /// Path to keypair file
    #[arg(long, global = true, default_value = "~/.config/solana/id.json")]
    pub keypair: String,
}

#[derive(Subcommand)]
pub enum Commands {
    /// Initialize a new stablecoin
    Init {
        #[arg(long)]
        preset: String,
        #[arg(long)]
        name: String,
        #[arg(long)]
        symbol: String,
        #[arg(long)]
        decimals: Option<u8>,
        #[arg(long)]
        supply_cap: Option<u64>,
    },
    /// Mint tokens
    Mint {
        #[arg(long)]
        mint: String,
        #[arg(long)]
        to: String,
        #[arg(long)]
        amount: u64,
    },
    /// Burn tokens
    Burn { ... },
    /// Freeze a token account
    Freeze { ... },
    /// Thaw a token account
    Thaw { ... },
    /// Pause operations
    Pause { ... },
    /// Unpause operations
    Unpause { ... },
    /// Seize tokens
    Seize { ... },
    /// Manage blacklist
    Blacklist {
        #[command(subcommand)]
        action: BlacklistAction,
    },
    /// Manage roles
    Roles {
        #[command(subcommand)]
        action: RoleAction,
    },
    /// Display stablecoin info
    Info {
        #[arg(long)]
        mint: String,
    },
    /// Confidential transfer operations (SSS-3)
    Confidential {
        #[command(subcommand)]
        action: ConfidentialAction,
    },
}
```

**Step 3: Implement each command file**

Each command in `cli/src/commands/`:
- `init.rs` — calls sss-core initialize
- `mint.rs` — calls sss-core mint_tokens
- `burn.rs` — calls sss-core burn_tokens
- `freeze.rs` / `thaw.rs` — freeze/thaw accounts
- `pause.rs` — pause/unpause
- `seize.rs` — seize via permanent delegate
- `blacklist.rs` — add/remove blacklist (calls sss-transfer-hook)
- `roles.rs` — grant/revoke/list roles
- `info.rs` — fetch and display StablecoinConfig
- `confidential.rs` — SSS-3 operations

**Step 4: Build and verify**

```bash
cargo build --bin sss
./target/debug/sss --help
```

**Step 5: Commit**

```bash
git add cli/
git commit -m "feat(cli): Rust CLI with clap — all stablecoin management commands"
```

---

## Phase 6: Backend Services

### Task 6.1: Backend Setup

**Files:**
- Create: `backend/package.json`
- Create: `backend/tsconfig.json`
- Create: `backend/src/main.ts`
- Create: `backend/src/services/mint-burn.service.ts`
- Create: `backend/src/services/event-listener.ts`
- Create: `backend/src/services/compliance.service.ts`
- Create: `backend/src/services/webhook.service.ts`
- Create: `backend/src/routes/operations.ts`
- Create: `backend/src/routes/compliance.ts`
- Create: `backend/src/routes/health.ts`
- Create: `backend/src/middleware/auth.ts`
- Create: `backend/src/middleware/rate-limit.ts`
- Create: `backend/Dockerfile`
- Create: `backend/.env.example`

**Architecture:** Express/Fastify REST API with:
- Mint/burn queue with rate limiting
- WebSocket event listener for on-chain events
- Compliance service (blacklist sync, KYC webhook receiver)
- Outbound webhook notifications
- API key authentication

**Routes:**
- `POST /operations/mint` — Queue mint operation
- `POST /operations/burn` — Queue burn operation
- `POST /operations/freeze` — Freeze account
- `POST /operations/thaw` — Thaw account
- `POST /operations/pause` — Pause operations
- `POST /compliance/blacklist` — Add/remove blacklist
- `GET /compliance/status/:address` — Check blacklist status
- `GET /health` — Health check

**Commit.**

---

## Phase 7: SSS-3 Confidential Transfers (Killer Differentiator)

### Task 7.1: Research & Verify Token-2022 Confidential Transfer API

**Step 1: Check spl-token confidential transfer support**

```bash
# Check if @solana/spl-token has confidential transfer helpers
pnpm info @solana/spl-token versions --json | tail -5
```

Read the `@solana/spl-token` source for `confidentialTransfer*` functions. Key functions we need:
- `createConfidentialTransferMint` / extension init
- `configureConfidentialTransferAccount`
- `depositConfidentialTokens`
- `applyPendingConfidentialTransferBalance`
- `confidentialTransfer`
- `withdrawConfidentialTokens`

**Step 2: Understand the proof requirements**

Confidential transfers require ZK proofs:
- **Range proof**: Prove sufficient balance without revealing it
- **Equality proof**: Prove sender/receiver encrypt the same amount
- **Ciphertext validity proof**: Prove ciphertext is valid

These proofs are generated client-side. The `@solana/spl-token` library should handle proof generation.

### Task 7.2: SSS-3 Preset Implementation

**Files:**
- Modify: `sdk/src/presets/sss3.ts`
- Create: `sdk/src/confidential/index.ts`
- Create: `sdk/src/confidential/keys.ts`
- Create: `sdk/src/confidential/proofs.ts`

**Step 1: SSS-3 mint creation**

The SSS-3 preset creates a mint with:
1. `ConfidentialTransferMint` extension — with auditor ElGamal public key
2. `PermanentDelegate` extension — config PDA for seizure
3. `MetadataPointer` + `TokenMetadata`

```typescript
// sdk/src/presets/sss3.ts
export async function createSss3Mint(
  connection: Connection,
  payer: Keypair,
  options: {
    name: string;
    symbol: string;
    uri?: string;
    decimals?: number;
    auditorElGamalPubkey: ElGamalPublicKey;
    autoApproveNewAccounts: boolean;
  },
): Promise<{ mint: Keypair; configPda: PublicKey }> {
  // 1. Calculate space for extensions
  // 2. Create account
  // 3. Initialize ConfidentialTransferMint
  // 4. Initialize PermanentDelegate
  // 5. Initialize MetadataPointer
  // 6. Initialize Mint
  // 7. Initialize Metadata
  // 8. Call sss-core initialize with preset=3
}
```

**Step 2: Confidential account configuration**

```typescript
// sdk/src/confidential/index.ts
export class ConfidentialOps {
  // Configure a token account for confidential transfers
  async configureAccount(tokenAccount: PublicKey): Promise<string>;

  // Deposit (convert public balance to confidential)
  async deposit(amount: bigint): Promise<string>;

  // Apply pending balance
  async applyPending(): Promise<string>;

  // Confidential transfer
  async transfer(recipient: PublicKey, amount: bigint): Promise<string>;

  // Withdraw (convert confidential balance to public)
  async withdraw(amount: bigint): Promise<string>;
}
```

**Step 3: ElGamal key derivation**

```typescript
// sdk/src/confidential/keys.ts
export function deriveElGamalKeypair(signer: Keypair): ElGamalKeypair;
export function deriveAesKey(signer: Keypair): AesKey;
```

### Task 7.3: SSS-3 Integration Tests

**Files:**
- Create: `tests/sss-3.test.ts`

Test flow:
1. Create SSS-3 mint with confidential transfer + auditor key
2. Configure sender account for confidential transfers
3. Configure receiver account
4. Mint tokens (public)
5. Deposit to confidential balance
6. Apply pending balance
7. Confidential transfer (sender → receiver)
8. Apply pending on receiver
9. Withdraw to public balance
10. Verify auditor can decrypt amounts

**Commit.**

### Task 7.4: Proof Backend Service

**Files:**
- Create: `backend/src/services/proof.service.ts`

For compute-heavy ZK proof generation, provide a REST endpoint:
- `POST /proof/range` — Generate range proof
- `POST /proof/equality` — Generate equality proof
- `POST /proof/ciphertext-validity` — Generate ciphertext validity proof

> Note: If `@solana/spl-token` handles proofs client-side natively, this service becomes a convenience wrapper for server-side operations.

**Commit.**

---

## Phase 8: Oracle Integration (Bonus)

### Task 8.1: Switchboard/Pyth Price Feed

**Files:**
- Modify: `programs/sss-core/src/instructions/mint_tokens.rs` (add optional oracle account)
- Create: `sdk/src/oracle/index.ts`

**Approach:** Add an optional oracle check in the mint instruction:
- If a price feed account is provided and a USD-denominated supply cap is configured, convert the supply cap from USD to token amount using the oracle price before checking.
- This is backward-compatible — omit the oracle account for non-oracle mints.

**Commit.**

---

## Phase 9: Admin TUI (Bonus)

### Task 9.1: Ratatui Dashboard

**Files:**
- Create: `tui/Cargo.toml`
- Create: `tui/src/main.rs`
- Create: `tui/src/app.rs`
- Create: `tui/src/ui/mod.rs`
- Create: `tui/src/ui/dashboard.rs`
- Create: `tui/src/ui/roles.rs`
- Create: `tui/src/ui/blacklist.rs`
- Create: `tui/src/ui/events.rs`

**Dependencies:**
```toml
[dependencies]
ratatui = "0.29"
crossterm = "0.28"
tokio = { version = "1", features = ["full"] }
solana-sdk = { workspace = true }
solana-client = { workspace = true }
anchor-client = "0.32.0"
anyhow = "1"
```

**Features:**
- Tab-based UI: Dashboard | Roles | Blacklist | Events
- Dashboard: mint info, current supply, supply cap, pause status, holder count
- Roles: list/grant/revoke roles
- Blacklist: list/add/remove entries
- Events: real-time event log (WebSocket subscription)
- Keyboard shortcuts: Tab to switch, Enter to act, q to quit

**Commit.**

---

## Phase 10: Frontend (Bonus)

### Task 10.1: Next.js Admin Dashboard

**Files:**
- Create: `frontend/` (Next.js 15 app)

**Setup:**
```bash
cd frontend
pnpm create next-app@latest . --ts --tailwind --app --src-dir --import-alias "@/*"
pnpm add @coral-xyz/anchor @solana/web3.js @solana/spl-token @solana/wallet-adapter-react @solana/wallet-adapter-wallets
```

**Pages:**
- `/` — Dashboard (overview, supply stats, role summary)
- `/mint-burn` — Mint/burn interface
- `/roles` — Role management
- `/blacklist` — Blacklist management (SSS-2 only)
- `/confidential` — Confidential ops (SSS-3 only)
- `/history` — Transaction history

**Components:**
- `WalletProvider` — Solana wallet adapter
- `StablecoinSelector` — Select active mint
- `SupplyChart` — Supply over time chart
- `RoleTable` — Role management table
- `BlacklistTable` — Blacklist entries

**Commit.**

---

## Phase 11: Fuzz Tests (Bonus)

### Task 11.1: Trident Fuzz Tests

**Files:**
- Create: `trident-tests/fuzz_tests/` (generated by Trident)

```bash
trident init
trident fuzz add
```

**Fuzz scenarios:**
1. **Role escalation**: Random sequences of grant/revoke — can a non-admin gain admin?
2. **Supply cap overflow**: Random mint/burn sequences — can supply exceed cap?
3. **Pause bypass**: Random pause/unpause with operations — can ops succeed when paused?
4. **Blacklist bypass**: Random blacklist operations — can blacklisted addresses transfer?
5. **Arithmetic overflow**: Large amounts in mint/burn/seize

**Commit.**

---

## Phase 12: Documentation

### Task 12.1: Core Documentation

**Files:**
- Create: `README.md` — Quick start, architecture diagram, preset comparison
- Create: `docs/ARCHITECTURE.md` — Detailed architecture, data flows, PDA derivation
- Create: `docs/SDK.md` — TypeScript SDK usage examples
- Create: `docs/CLI.md` — CLI command reference
- Create: `docs/OPERATIONS.md` — Operator runbook
- Create: `docs/SSS-1.md` — SSS-1 specification
- Create: `docs/SSS-2.md` — SSS-2 specification
- Create: `docs/SSS-3.md` — SSS-3 specification (key differentiator doc)
- Create: `docs/COMPLIANCE.md` — Regulatory considerations
- Create: `docs/API.md` — Backend REST API reference
- Create: `docs/SECURITY.md` — Threat model, access control

> README should have a compelling architecture diagram (ASCII art from design doc), clear preset comparison table, and quick-start that gets someone to "mint their first token" in <5 minutes.

**Commit each doc separately for clean history.**

---

## Phase 13: Devnet Deployment & Proofs

### Task 13.1: Deploy Programs to Devnet

**Step 1: Build release binaries**

```bash
anchor build --verifiable
```

**Step 2: Deploy to devnet**

```bash
anchor deploy --provider.cluster devnet --program-name sss_core
anchor deploy --provider.cluster devnet --program-name sss_transfer_hook
```

**Step 3: Save deployment artifacts**

```json
// deployments/devnet-sss-core.json
{
  "programId": "...",
  "deployTx": "...",
  "timestamp": "...",
  "slot": ...
}
```

### Task 13.2: Run Lifecycle Proofs

**Files:**
- Create: `scripts/devnet-sss1-proof.ts`
- Create: `scripts/devnet-sss2-proof.ts`
- Create: `scripts/devnet-sss3-proof.ts`

Each script:
1. Creates a mint with the preset
2. Performs all preset operations (mint, burn, freeze, thaw, pause, etc.)
3. Saves transaction signatures to `deployments/devnet-sss{N}-proof.json`

```json
// deployments/devnet-sss1-proof.json
{
  "mint": "...",
  "transactions": {
    "initialize": "...",
    "grantMinter": "...",
    "mint": "...",
    "burn": "...",
    "freeze": "...",
    "thaw": "...",
    "pause": "...",
    "unpause": "..."
  },
  "timestamp": "..."
}
```

> **Important:** Ask RECTOR for devnet SOL funding before running these scripts.

**Commit.**

---

## Phase 14: Final Audit & Submission

### Task 14.1: Self-Audit

Run `/audit:roast` against the entire codebase. Fix all critical and high-severity findings.

### Task 14.2: Code Review

Run `/superpowers:requesting-code-review` for final review.

### Task 14.3: Submit PR

```bash
# Push to origin
git push origin main

# Create PR to upstream
gh pr create --repo solanabr/solana-stablecoin-standard \
  --title "feat: Complete SSS Implementation — SSS-1, SSS-2, SSS-3 with SDK, CLI, Backend, TUI, and Frontend" \
  --body "$(cat <<'EOF'
## Solana Stablecoin Standard — Full Implementation

### Architecture
- 2 Anchor programs: `sss-core` (universal) + `sss-transfer-hook` (compliance)
- 3 presets: SSS-1 (minimal), SSS-2 (compliant), SSS-3 (private/confidential)
- TypeScript SDK, Rust CLI, Backend services, Admin TUI (ratatui), Next.js frontend

### Highlights
- **SSS-3**: Full confidential transfer support with auditor key — unique among all submissions
- **Oracle integration**: USD-denominated supply caps via Switchboard/Pyth
- **Fuzz tests**: Trident-based fuzzing for security
- **Admin TUI**: Terminal dashboard for stablecoin management
- **Devnet proofs**: All 3 presets deployed and tested on devnet

### Testing
- Rust unit tests
- SDK unit tests (Vitest)
- Integration tests (Anchor + Mocha)
- Fuzz tests (Trident)
- Devnet lifecycle proofs

### Documentation
- Architecture, SDK, CLI, API, Operations, Security
- Individual specs for SSS-1, SSS-2, SSS-3
- Compliance and regulatory considerations
EOF
)"
```

---

## Execution Order Summary

| Day | Phase | Parallelizable |
|-----|-------|---------------|
| 1 | Phase 0: Scaffolding | No |
| 2-4 | Phase 1: sss-core | ← parallel with Phase 2 |
| 2-3 | Phase 2: sss-transfer-hook | ← parallel with Phase 1 |
| 5-6 | Phase 3: Integration tests | No (needs both programs) |
| 7-9 | Phase 4: TypeScript SDK | No (needs IDL from programs) |
| 10-11 | Phase 5: Rust CLI | ← parallel with Phase 6, 7 |
| 12 | Phase 6: Backend | ← parallel with Phase 5, 7 |
| 13-15 | Phase 7: SSS-3 | ← parallel with Phase 5, 6 |
| 13 | Phase 8: Oracle | ← parallel with Phase 5, 6, 7 |
| 14 | Phase 11: Fuzz tests | ← parallel with Phase 7, 8, 9 |
| 15-16 | Phase 9: Admin TUI | ← parallel with Phase 10, 11 |
| 16-17 | Phase 10: Frontend | ← parallel with Phase 9, 12 |
| 17 | Phase 12: Documentation | ← parallel with Phase 10 |
| 17-18 | Phase 13: Devnet proofs | No (needs everything built) |
| 18 | Phase 14: Audit & Submit | No (final step) |

**Critical path:** Phase 0 → Phase 1+2 → Phase 3 → Phase 4 → Phase 7 → Phase 13 → Phase 14

**Droppable (if behind schedule):** Phase 8 (Oracle), Phase 9 (TUI), Phase 10 (Frontend) — in that order. Never drop SSS-3.
