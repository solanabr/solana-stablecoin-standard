use anchor_lang::prelude::*;

pub mod errors;
pub mod events;
pub mod instructions;
pub mod state;

use instructions::*;

declare_id!("6NMdvUa2n4WSLPx9yz7V9edFx9VQqWr5KUDZQGPK3GDL");

#[program]
pub mod sss_token {
    use super::*;

    // ─── Core (SSS-1 & SSS-2) ────────────────────────────────────────────────

    /// Initialize a new stablecoin mint with chosen extensions.
    /// Pass `enable_permanent_delegate = true` and `enable_transfer_hook = true`
    /// to activate SSS-2 compliance features.
    pub fn initialize(ctx: Context<Initialize>, config: StablecoinConfig) -> Result<()> {
        instructions::initialize::handler(ctx, config)
    }

    /// Mint tokens to a recipient. Caller must hold the Minter role and
    /// respect their lifetime minter quota (0 = unlimited).
    pub fn mint(ctx: Context<MintCtx>, amount: u64) -> Result<()> {
        instructions::mint::handler(ctx, amount)
    }

    /// Burn tokens.
    /// - Token-account owners can always burn from their own account.
    /// - Burner role can burn from any account when permanent delegate is enabled.
    pub fn burn(ctx: Context<BurnCtx>, amount: u64) -> Result<()> {
        instructions::burn::handler(ctx, amount)
    }

    /// Freeze a token account (prevents transfers). Caller must hold Freezer role.
    pub fn freeze_account(ctx: Context<FreezeAccount>) -> Result<()> {
        instructions::freeze_account::handler(ctx)
    }

    /// Unfreeze a previously frozen token account.
    pub fn thaw_account(ctx: Context<ThawAccount>) -> Result<()> {
        instructions::thaw_account::handler(ctx)
    }

    /// Pause all minting and burning globally. Only Pauser.
    pub fn pause(ctx: Context<Pause>) -> Result<()> {
        instructions::pause::handler(ctx)
    }

    /// Unpause the protocol.
    pub fn unpause(ctx: Context<Unpause>) -> Result<()> {
        instructions::unpause::handler(ctx)
    }

    /// Add or update a minter with a lifetime quota (0 = unlimited).
    pub fn add_minter(ctx: Context<AddMinter>, quota: u64) -> Result<()> {
        instructions::update_minter::add_minter_handler(ctx, quota)
    }

    pub fn remove_minter(ctx: Context<RemoveMinter>) -> Result<()> {
        instructions::update_minter::remove_minter_handler(ctx)
    }

    /// Increase an active minter's lifetime quota by `additional_quota`.
    pub fn increase_minter_quota(ctx: Context<IncreaseMinterQuota>, additional_quota: u64) -> Result<()> {
        instructions::update_minter::increase_minter_quota_handler(ctx, additional_quota)
    }

    /// Update role assignments (pauser, freezer, burner, blacklister, seizer).
    pub fn update_roles(ctx: Context<UpdateRoles>, role_update: RoleUpdate) -> Result<()> {
        instructions::update_roles::handler(ctx, role_update)
    }

    /// Transfer master authority to a new key (two-step: propose then accept).
    pub fn propose_authority(ctx: Context<ProposeAuthority>) -> Result<()> {
        instructions::transfer_authority::propose_handler(ctx)
    }

    /// Accept a pending authority transfer.
    pub fn accept_authority(ctx: Context<AcceptAuthority>) -> Result<()> {
        instructions::transfer_authority::accept_handler(ctx)
    }

    // ─── SSS-2 Compliance ────────────────────────────────────────────────────

    /// Add an address to the blacklist. Fails if compliance was not enabled.
    pub fn add_to_blacklist(ctx: Context<AddToBlacklist>, reason: String) -> Result<()> {
        instructions::compliance::add_to_blacklist_handler(ctx, reason)
    }

    /// Remove an address from the blacklist.
    pub fn remove_from_blacklist(ctx: Context<RemoveFromBlacklist>, reason: String) -> Result<()> {
        instructions::compliance::remove_from_blacklist_handler(ctx, reason)
    }

    /// Seize tokens from a blacklisted account to treasury via permanent delegate.
    pub fn seize<'info>(ctx: Context<'_, '_, 'info, 'info, Seize<'info>>) -> Result<()> {
        instructions::compliance::seize_handler(ctx)
    }
}

// ─── Shared types re-exported for CPI consumers ──────────────────────────────
pub use state::{StablecoinConfig, RoleUpdate};