use anchor_lang::prelude::*;

pub mod errors;
pub mod instructions;
pub mod state;

use instructions::*;

declare_id!("Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS");

/// Solana Stablecoin Standard — Main token program
///
/// Supports configurable presets:
/// - SSS-1: Minimal stablecoin (mint + freeze + metadata)
/// - SSS-2: Compliant stablecoin (SSS-1 + permanent delegate + transfer hook + blacklist)
/// - SSS-3: Private stablecoin (SSS-1 + confidential transfers) [experimental]
#[program]
pub mod sss_token {
    use super::*;

    /// Initialize a new stablecoin with the given configuration.
    /// Creates the Token-2022 mint with appropriate extensions based on config.
    pub fn initialize(ctx: Context<Initialize>, params: InitializeParams) -> Result<()> {
        instructions::initialize::handler(ctx, params)
    }

    /// Mint tokens to a recipient. Requires minter role with available quota.
    pub fn mint_tokens(ctx: Context<MintTokens>, amount: u64) -> Result<()> {
        instructions::mint::handler(ctx, amount)
    }

    /// Burn tokens from the caller's account. Requires burner role.
    pub fn burn_tokens(ctx: Context<BurnTokens>, amount: u64) -> Result<()> {
        instructions::burn::handler(ctx, amount)
    }

    /// Freeze a token account. Requires master authority or pauser role.
    pub fn freeze_account(ctx: Context<FreezeAccount>) -> Result<()> {
        instructions::freeze::handler(ctx)
    }

    /// Thaw a frozen token account. Requires master authority.
    pub fn thaw_account(ctx: Context<ThawAccount>) -> Result<()> {
        instructions::thaw::handler(ctx)
    }

    /// Pause all mint/burn operations globally.
    pub fn pause(ctx: Context<Pause>) -> Result<()> {
        instructions::pause::pause_handler(ctx)
    }

    /// Unpause all operations.
    pub fn unpause(ctx: Context<Unpause>) -> Result<()> {
        instructions::pause::unpause_handler(ctx)
    }

    /// Add or update a minter with a quota.
    pub fn update_minter(
        ctx: Context<UpdateMinter>,
        minter: Pubkey,
        quota: u64,
    ) -> Result<()> {
        instructions::roles::update_minter_handler(ctx, minter, quota)
    }

    /// Remove a minter.
    pub fn remove_minter(ctx: Context<RemoveMinter>, minter: Pubkey) -> Result<()> {
        instructions::roles::remove_minter_handler(ctx, minter)
    }

    /// Update role assignments (pauser, blacklister, seizer, burners).
    pub fn update_roles(ctx: Context<UpdateRoles>, params: UpdateRolesParams) -> Result<()> {
        instructions::roles::update_roles_handler(ctx, params)
    }

    /// Transfer master authority to a new address.
    pub fn transfer_authority(
        ctx: Context<TransferAuthority>,
        new_authority: Pubkey,
    ) -> Result<()> {
        instructions::roles::transfer_authority_handler(ctx, new_authority)
    }

    // ── SSS-2 Compliance Instructions ──────────────────────────────────

    /// Add an address to the blacklist. SSS-2 only.
    pub fn add_to_blacklist(
        ctx: Context<AddToBlacklist>,
        reason: String,
    ) -> Result<()> {
        instructions::blacklist::add_handler(ctx, reason)
    }

    /// Remove an address from the blacklist. SSS-2 only.
    pub fn remove_from_blacklist(ctx: Context<RemoveFromBlacklist>) -> Result<()> {
        instructions::blacklist::remove_handler(ctx)
    }

    /// Seize tokens from a frozen, blacklisted account using permanent delegate.
    /// Transfers tokens to the treasury. SSS-2 only.
    pub fn seize(ctx: Context<Seize>) -> Result<()> {
        instructions::seize::handler(ctx)
    }
}
