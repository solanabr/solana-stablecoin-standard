use anchor_lang::prelude::*;

pub mod constants;
pub mod error;
pub mod events;
pub mod instructions;
pub mod state;

use instructions::*;

declare_id!("AeCfxEUv75EWAGgjnhAZhViFbkfsP1imLsg4xb3xuntm");

#[program]
pub mod sss_token {
    use super::*;

    // ─── Core (all presets) ──────────────────────────────────────────────────

    /// Initialize a new stablecoin mint with the selected preset configuration.
    /// This creates the Token-2022 mint with all requested extensions and the
    /// StablecoinConfig PDA. For SSS-2 mints the transfer hook program must
    /// already be deployed and its program ID supplied.
    pub fn initialize(ctx: Context<Initialize>, params: InitializeParams) -> Result<()> {
        instructions::initialize::handler(ctx, params)
    }

    /// Mint new tokens to a recipient. Caller must be an active, authorized minter.
    /// Respects per-minter quotas. Fails if the contract is paused.
    pub fn mint_tokens(ctx: Context<MintTokens>, amount: u64) -> Result<()> {
        instructions::mint_tokens::handler(ctx, amount)
    }

    /// Burn tokens from a token account. Caller must hold the burner role
    /// (or be the master authority). Token account owner must also sign.
    pub fn burn_tokens(ctx: Context<BurnTokens>, amount: u64) -> Result<()> {
        instructions::burn_tokens::handler(ctx, amount)
    }

    /// Freeze a token account. Only the master authority can freeze.
    pub fn freeze_token_account(ctx: Context<FreezeTokenAccount>) -> Result<()> {
        instructions::freeze_account::handler(ctx)
    }

    /// Thaw a frozen token account.
    pub fn thaw_token_account(ctx: Context<ThawTokenAccount>) -> Result<()> {
        instructions::thaw_account::handler(ctx)
    }

    /// Pause the contract — disables mint and burn. Pauser or authority only.
    pub fn pause(ctx: Context<Pause>) -> Result<()> {
        instructions::pause::handler(ctx)
    }

    /// Unpause the contract. Pauser or authority only.
    pub fn unpause(ctx: Context<Unpause>) -> Result<()> {
        instructions::unpause::handler(ctx)
    }

    /// Add or update a minter with an optional quota cap (0 = unlimited).
    /// Only master authority can manage minters.
    pub fn update_minter(ctx: Context<UpdateMinter>, params: UpdateMinterParams) -> Result<()> {
        instructions::update_minter::handler(ctx, params)
    }

    /// Update secondary roles (burner, pauser, blacklister, seizer).
    /// Only master authority.
    pub fn update_roles(ctx: Context<UpdateRoles>, params: UpdateRolesParams) -> Result<()> {
        instructions::update_roles::handler(ctx, params)
    }

    /// Transfer master authority to a new address. Immediately effective.
    pub fn transfer_authority(ctx: Context<TransferAuthority>, new_authority: Pubkey) -> Result<()> {
        instructions::transfer_authority::handler(ctx, new_authority)
    }

    // ─── SSS-2 Compliance ────────────────────────────────────────────────────

    /// Add an address to the blacklist. Creates a BlacklistEntry PDA.
    /// The transfer hook checks this PDA on every transfer.
    /// Fails with InvalidPreset if called on an SSS-1 mint.
    pub fn add_to_blacklist(
        ctx: Context<AddToBlacklist>,
        address: Pubkey,
        reason: String,
    ) -> Result<()> {
        instructions::add_to_blacklist::handler(ctx, address, reason)
    }

    /// Remove an address from the blacklist. Closes the BlacklistEntry PDA
    /// and reclaims rent to the blacklister.
    pub fn remove_from_blacklist(
        ctx: Context<RemoveFromBlacklist>,
        address: Pubkey,
    ) -> Result<()> {
        instructions::remove_from_blacklist::handler(ctx, address)
    }

    /// Seize tokens from an account using the permanent delegate.
    /// The config PDA is the registered permanent delegate; it signs via PDA seeds.
    /// Fails with InvalidPreset if called on an SSS-1 mint.
    pub fn seize(ctx: Context<Seize>, amount: u64) -> Result<()> {
        instructions::seize::handler(ctx, amount)
    }
}
