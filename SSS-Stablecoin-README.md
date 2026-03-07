# SSS Stablecoin Standard (Single Configurable Program)

A configurable Solana stablecoin standard supporting:

-   **SSS-1** → Minimal Stablecoin
-   **SSS-2** → Compliant Stablecoin (blacklist + seizure + transfer
    hook)

This design uses **one Anchor program** with initialization-based preset
selection.

------------------------------------------------------------------------

# Architecture Overview

    +--------------------------------------------------+
    |            SSS Stablecoin Program               |
    |--------------------------------------------------|
    |  • Initialization (preset selection)            |
    |  • Role-based access control                    |
    |  • Mint / Burn                                  |
    |  • Freeze / Thaw                                |
    |  • Pause / Unpause                              |
    |  • Authority updates                            |
    |  • Optional compliance layer (SSS-2)            |
    +--------------------------------------------------+

                  |
                  v

    +--------------------------+
    |  SPL Token OR Token-2022 |
    +--------------------------+

                  |
                  v (SSS-2 only)

    +--------------------------+
    |   Transfer Hook Program  |
    |  (Blacklist enforcement) |
    +--------------------------+

------------------------------------------------------------------------

# Preset Selection

At initialization:

``` rust
pub enum Standard {
    SSS1,
    SSS2,
}

#[account]
pub struct StablecoinConfig {
    pub standard: Standard,
    pub mint: Pubkey,
    pub token_program: Pubkey,
    pub master_authority: Pubkey,
    pub paused: bool,

    // SSS-2 only
    pub blacklist_authority: Pubkey,
}
```

Feature gating example:

``` rust
impl StablecoinConfig {
    pub fn assert_sss2(&self) -> Result<()> {
        require!(
            self.standard == Standard::SSS2,
            ErrorCode::ComplianceNotEnabled
        );
        Ok(())
    }
}
```

------------------------------------------------------------------------

# Account & PDA Layout

## Config PDA

**Seeds:** `["config", mint]`

Stores: - standard (SSS1 or SSS2) - token_program - paused state -
master authority

------------------------------------------------------------------------

## Role PDA

``` rust
#[account]
pub struct RoleAccount {
    pub role: RoleType,
    pub authority: Pubkey,
    pub quota: u64, // for minters
}
```

**Seeds:** `["role", mint, role_type]`

Roles: - Master - Minter (with quota) - Burner - Pauser - Blacklister
(SSS-2) - Seizer (SSS-2)

------------------------------------------------------------------------

## Blacklist PDA (SSS-2 only)

``` rust
#[account]
pub struct BlacklistEntry {
    pub wallet: Pubkey,
}
```

**Seeds:** `["blacklist", mint, wallet]`

------------------------------------------------------------------------

# Token vs Token-2022 Strategy

Use:

``` rust
anchor_spl::token_interface::TokenInterface
```

In accounts:

``` rust
pub token_program: Interface<'info, TokenInterface>,
```

This allows unified CPI calls for: - SPL Token - Token-2022

### SSS-1

-   Can use SPL Token OR Token-2022 (minimal)

### SSS-2

-   MUST use Token-2022
-   Requires:
    -   Permanent Delegate extension
    -   Transfer Hook extension
    -   (Optional) Default Account State extension

------------------------------------------------------------------------

# Transfer Hook Program (SSS-2 Required)

Token-2022 automatically calls the hook program during transfers.

Minimal example:

``` rust
use anchor_lang::prelude::*;

declare_id!("Hook1111111111111111111111111111111111");

#[program]
pub mod sss_transfer_hook {
    use super::*;

    pub fn execute(ctx: Context<TransferHook>, _amount: u64) -> Result<()> {
        let sender = ctx.accounts.source.owner;
        let receiver = ctx.accounts.destination.owner;

        if ctx.accounts.is_blacklisted(sender)? ||
           ctx.accounts.is_blacklisted(receiver)? {
            return err!(ErrorCode::Blacklisted);
        }

        Ok(())
    }
}

#[derive(Accounts)]
pub struct TransferHook<'info> {
    /// CHECK: validated by token-2022
    pub source: AccountInfo<'info>,
    /// CHECK: validated by token-2022
    pub destination: AccountInfo<'info>,
}

#[error_code]
pub enum ErrorCode {
    #[msg("Address is blacklisted")]
    Blacklisted,
}
```

------------------------------------------------------------------------

# Instruction Set

## Core (All Modes)

-   initialize
-   mint
-   burn
-   freeze_account
-   thaw_account
-   pause
-   unpause
-   update_minter
-   update_roles
-   transfer_authority

## SSS-2 Only

-   add_to_blacklist
-   remove_from_blacklist
-   seize (via permanent delegate)

------------------------------------------------------------------------

# Seizure Logic (SSS-2)

1.  Permanent delegate = Program PDA
2.  Program signs
3.  Calls `transfer_checked` via Token-2022
4.  Moves funds without user signature

------------------------------------------------------------------------

# Security Model

-   No single "god key"
-   Role-separated authorities
-   PDA-based signing
-   Compliance feature gating
-   Hook enforces blacklist on every transfer
-   SSS-2 instructions fail gracefully if not enabled

------------------------------------------------------------------------

# Design Philosophy

-   One configurable program
-   Minimal branching
-   TokenInterface abstraction
-   Compliance is additive
-   Small hook program
-   Audit-friendly PDA layout
