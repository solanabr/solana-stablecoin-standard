//! SSS-Token: Solana Stablecoin Standard
//!
//! A single configurable program supporting both SSS-1 (Minimal Stablecoin) and
//! SSS-2 (Compliant Stablecoin) presets via initialization parameters.
//!
//! SSS-1: Mint authority + freeze authority + metadata. Simple stablecoins for
//! internal tokens, DAO treasuries, ecosystem settlement.
//!
//! SSS-2: SSS-1 + permanent delegate + transfer hook + blacklist enforcement.
//! Regulated stablecoins (USDC/USDT-class) with on-chain compliance.
//!
//! Key features:
//! - Supply cap enforcement (optional hard ceiling)
//! - Per-minter quotas
//! - Two-step authority transfer (nominate → accept, prevents typo losses)
//! - Seize via burn+mint (avoids transfer hook blocking transfers FROM blacklisted)
//! - Role-based access control with audit trail
//! - Built on Token-2022

use anchor_lang::prelude::*;

#[cfg(not(feature = "no-entrypoint"))]
use solana_security_txt::security_txt;

#[cfg(not(feature = "no-entrypoint"))]
security_txt! {
    name: "SSS Token - Solana Stablecoin Standard",
    project_url: "https://github.com/solanabr/solana-stablecoin-standard",
    contacts: "link:https://github.com/solanabr/solana-stablecoin-standard/issues",
    policy: "https://github.com/solanabr/solana-stablecoin-standard/blob/main/SECURITY.md",
    preferred_languages: "en",
    source_code: "https://github.com/solanabr/solana-stablecoin-standard",
    auditors: "Community review"
}

pub mod constants;
pub mod error;
pub mod events;
pub mod instructions;
pub mod state;

use instructions::*;

declare_id!("4G5DbG9WojH11bcpHQS4wvWKT7YDdnZzaYoGjLU9NYtF");

#[program]
pub mod sss_token {
    use super::*;

    // ============ Core Instructions (all presets) ============

    pub fn initialize(
        ctx: Context<Initialize>,
        params: initialize::InitializeParams,
    ) -> Result<()> {
        instructions::initialize::handler(ctx, params)
    }

    pub fn mint(ctx: Context<MintTokens>, amount: u64) -> Result<()> {
        instructions::mint_tokens::handler(ctx, amount)
    }

    pub fn burn(ctx: Context<BurnTokens>, amount: u64) -> Result<()> {
        instructions::burn_tokens::handler(ctx, amount)
    }

    pub fn freeze_account(ctx: Context<FreezeTokenAccount>) -> Result<()> {
        instructions::freeze_account::handler(ctx)
    }

    pub fn thaw_account(ctx: Context<ThawTokenAccount>) -> Result<()> {
        instructions::thaw_account::handler(ctx)
    }

    pub fn pause(ctx: Context<Pause>) -> Result<()> {
        instructions::pause::pause_handler(ctx)
    }

    pub fn unpause(ctx: Context<Pause>) -> Result<()> {
        instructions::pause::unpause_handler(ctx)
    }

    pub fn update_roles(
        ctx: Context<UpdateRoles>,
        target: Pubkey,
        role_flag: u16,
        grant: bool,
    ) -> Result<()> {
        instructions::roles::update_roles_handler(ctx, target, role_flag, grant)
    }

    pub fn update_minter(
        ctx: Context<UpdateMinter>,
        minter_key: Pubkey,
        quota: u64,
        active: bool,
    ) -> Result<()> {
        instructions::roles::update_minter_handler(ctx, minter_key, quota, active)
    }

    /// Two-step authority transfer: Step 1 — Nominate a new authority.
    /// The nominated authority must call accept_authority to complete the transfer.
    /// Prevents accidental loss from typos (inspired by Circle's FiatToken v2).
    pub fn nominate_authority(
        ctx: Context<NominateAuthority>,
        new_authority: Pubkey,
    ) -> Result<()> {
        instructions::roles::nominate_authority_handler(ctx, new_authority)
    }

    /// Two-step authority transfer: Step 2 — Accept authority.
    /// Must be called by the previously nominated pending authority.
    pub fn accept_authority(ctx: Context<AcceptAuthority>) -> Result<()> {
        instructions::roles::accept_authority_handler(ctx)
    }

    /// Update the supply cap. Set to 0 to remove the cap.
    /// New cap must be >= current circulating supply.
    pub fn update_supply_cap(ctx: Context<UpdateSupplyCap>, new_cap: u64) -> Result<()> {
        instructions::roles::update_supply_cap_handler(ctx, new_cap)
    }

    // ============ SSS-2 Compliance Instructions ============

    pub fn add_to_blacklist(
        ctx: Context<AddToBlacklist>,
        target: Pubkey,
        reason: String,
    ) -> Result<()> {
        instructions::blacklist::add_to_blacklist_handler(ctx, target, reason)
    }

    pub fn remove_from_blacklist(
        ctx: Context<RemoveFromBlacklist>,
        target: Pubkey,
    ) -> Result<()> {
        instructions::blacklist::remove_from_blacklist_handler(ctx, target)
    }

    /// Seize all tokens from an account.
    /// Uses burn+mint_to pattern to avoid transfer hook blocking transfers
    /// FROM blacklisted accounts.
    pub fn seize(ctx: Context<Seize>) -> Result<()> {
        instructions::seize::handler(ctx)
    }
}
