use anchor_lang::prelude::*;

pub mod instructions;
pub mod state;

use instructions::*;
use state::Role;

declare_id!("SSStoken11111111111111111111111111111111111");

#[program]
pub mod sss_token {
    use super::*;

    /// Initialize a new stablecoin with the given configuration.
    pub fn initialize(ctx: Context<Initialize>, config: StablecoinConfig) -> Result<()> {
        instructions::initialize::initialize_handler(ctx, config)
    }

    /// Mint tokens to a recipient. Caller must have the minter role.
    pub fn mint_tokens(ctx: Context<MintTokens>, amount: u64) -> Result<()> {
        instructions::mint::mint_handler(ctx, amount)
    }

    /// Burn tokens. Caller must have the burner role.
    pub fn burn_tokens(ctx: Context<BurnTokens>, amount: u64) -> Result<()> {
        instructions::burn::burn_handler(ctx, amount)
    }

    /// Freeze a token account.
    pub fn freeze_account(ctx: Context<FreezeAccount>) -> Result<()> {
        instructions::freeze::freeze_handler(ctx)
    }

    /// Thaw a frozen token account.
    pub fn thaw_account(ctx: Context<ThawAccount>) -> Result<()> {
        instructions::freeze::thaw_handler(ctx)
    }

    /// Pause all minting/burning.
    pub fn pause(ctx: Context<Pause>) -> Result<()> {
        instructions::pause::pause_handler(ctx)
    }

    /// Unpause.
    pub fn unpause(ctx: Context<Unpause>) -> Result<()> {
        instructions::pause::unpause_handler(ctx)
    }

    /// Add or update a minter with an optional quota.
    pub fn update_minter(ctx: Context<UpdateMinter>, quota: Option<u64>) -> Result<()> {
        instructions::roles::update_minter_handler(ctx, quota)
    }

    /// Remove a minter.
    pub fn remove_minter(ctx: Context<RemoveMinter>) -> Result<()> {
        instructions::roles::remove_minter_handler(ctx)
    }

    /// Update roles (assign/revoke burner, pauser, blacklister, seizer).
    pub fn update_roles(
        ctx: Context<UpdateRoles>,
        role: Role,
        assignee: Pubkey,
        active: bool,
    ) -> Result<()> {
        instructions::roles::update_roles_handler(ctx, role, assignee, active)
    }

    /// Transfer master authority to a new key.
    pub fn transfer_authority(ctx: Context<TransferAuthority>) -> Result<()> {
        instructions::roles::transfer_authority_handler(ctx)
    }

    // --- SSS-2 (Compliant) instructions ---

    /// Add an address to the blacklist. SSS-2 only.
    pub fn add_to_blacklist(ctx: Context<AddToBlacklist>, reason: String) -> Result<()> {
        instructions::blacklist::add_handler(ctx, reason)
    }

    /// Remove an address from the blacklist. SSS-2 only.
    pub fn remove_from_blacklist(ctx: Context<RemoveFromBlacklist>) -> Result<()> {
        instructions::blacklist::remove_handler(ctx)
    }

    /// Seize tokens from a blacklisted account via permanent delegate. SSS-2 only.
    pub fn seize(ctx: Context<Seize>) -> Result<()> {
        instructions::seize::seize_handler(ctx)
    }
}
