pub mod constants;
pub mod error;
pub mod instructions;
pub mod state;

use anchor_lang::prelude::*;

pub use constants::*;
pub use instructions::*;
pub use state::*;

declare_id!("GMqW1Zi5DExSZT6CJEYHjhjmP6hUmu2tv9vrYaCgTPrE");

#[program]
pub mod solana_stablecoin_standard {
    use super::*;

    // ─── Core Initialization ───────────────────────────────────────────────

    /// Initialize a new SSS-1 or SSS-2 stablecoin.
    /// The Token-2022 mint must be pre-created with appropriate extensions.
    pub fn initialize(ctx: Context<Initialize>, params: InitializeParams) -> Result<()> {
        initialize::handler(ctx, params)
    }

    // ─── Token Operations ──────────────────────────────────────────────────

    /// Mint tokens to a recipient account (requires minter role)
    pub fn mint_tokens(ctx: Context<MintTokens>, amount: u64) -> Result<()> {
        mint_tokens::handler(ctx, amount)
    }

    /// Burn tokens from a source account (requires burner role)
    pub fn burn_tokens(ctx: Context<BurnTokens>, amount: u64) -> Result<()> {
        burn_tokens::handler(ctx, amount)
    }

    // ─── Compliance Controls ───────────────────────────────────────────────

    /// Freeze a token account (requires master_authority or pauser)
    pub fn freeze_account(ctx: Context<FreezeTokenAccount>) -> Result<()> {
        freeze_thaw::freeze_handler(ctx)
    }

    /// Thaw (unfreeze) a token account (requires master_authority or pauser)
    pub fn thaw_account(ctx: Context<FreezeTokenAccount>) -> Result<()> {
        freeze_thaw::thaw_handler(ctx)
    }

    /// Pause all transfers globally (requires pauser role)
    pub fn pause(ctx: Context<PauseUnpause>) -> Result<()> {
        pause::pause_handler(ctx)
    }

    /// Unpause transfers (requires pauser role)
    pub fn unpause(ctx: Context<PauseUnpause>) -> Result<()> {
        pause::unpause_handler(ctx)
    }

    // ─── SSS-2: Advanced Compliance ───────────────────────────────────────

    /// Add an address to the blacklist (SSS-2 only, requires blacklister role)
    pub fn add_to_blacklist(
        ctx: Context<AddToBlacklist>,
        target: Pubkey,
        reason: u8,
    ) -> Result<()> {
        blacklist::add_handler(ctx, target, reason)
    }

    /// Remove an address from the blacklist (SSS-2 only, requires blacklister role)
    pub fn remove_from_blacklist(
        ctx: Context<RemoveFromBlacklist>,
        target: Pubkey,
    ) -> Result<()> {
        blacklist::remove_handler(ctx, target)
    }

    /// Seize tokens from a holder using permanent delegate (SSS-2 only, requires seizer role)
    pub fn seize(ctx: Context<SeizeTokens>, amount: u64) -> Result<()> {
        seize::handler(ctx, amount)
    }

    // ─── Administration ────────────────────────────────────────────────────

    /// Update roles (minter, burner, blacklister, pauser, seizer)
    pub fn update_roles(ctx: Context<UpdateRoles>, params: UpdateRolesParams) -> Result<()> {
        update_roles::handler(ctx, params)
    }

    /// Transfer master authority to a new address
    pub fn transfer_authority(
        ctx: Context<TransferAuthority>,
        new_authority: Pubkey,
    ) -> Result<()> {
        update_roles::transfer_authority_handler(ctx, new_authority)
    }
}
