use anchor_lang::prelude::*;

pub mod errors;
pub mod instructions;
pub mod state;

use instructions::*;

declare_id!("SSSTokenXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX");

#[program]
pub mod sss_token {
    use super::*;

    /// Deploy a new SSS token. Preset 1 = minimal (SSS-1), preset 2 = compliant (SSS-2).
    pub fn initialize(ctx: Context<Initialize>, params: InitializeParams) -> Result<()> {
        instructions::initialize::handler(ctx, params)
    }

    /// Mint tokens to a destination account. Requires MINTER role.
    pub fn mint_tokens(ctx: Context<MintTokens>, params: MintParams) -> Result<()> {
        instructions::mint::handler(ctx, params)
    }

    /// Burn tokens from the caller's account. Requires BURNER role.
    pub fn burn_tokens(ctx: Context<BurnTokens>, params: BurnParams) -> Result<()> {
        instructions::burn::handler(ctx, params)
    }

    /// Freeze a token account. Requires FREEZER role.
    pub fn freeze_account(ctx: Context<FreezeAccount>) -> Result<()> {
        instructions::freeze::handler_freeze(ctx)
    }

    /// Thaw a frozen token account. Requires FREEZER role.
    pub fn thaw_account(ctx: Context<FreezeAccount>) -> Result<()> {
        instructions::freeze::handler_thaw(ctx)
    }

    /// Pause all token operations. Requires ADMIN role.
    pub fn pause(ctx: Context<PauseControl>) -> Result<()> {
        instructions::pause::handler_pause(ctx)
    }

    /// Resume token operations. Requires ADMIN role.
    pub fn unpause(ctx: Context<PauseControl>) -> Result<()> {
        instructions::pause::handler_unpause(ctx)
    }

    /// Assign a role to an authority. Requires ADMIN role.
    pub fn grant_role(ctx: Context<GrantRole>, target: Pubkey, role_flag: u8) -> Result<()> {
        instructions::roles::handler_grant(ctx, target, role_flag)
    }

    /// Remove a role from an authority. Requires ADMIN role.
    pub fn revoke_role(ctx: Context<RevokeRole>, target: Pubkey, role_flag: u8) -> Result<()> {
        instructions::roles::handler_revoke(ctx, target, role_flag)
    }

    // --- SSS-2 only instructions ---

    /// Add an address to the blacklist. SSS-2 only, requires BLACKLISTER role.
    pub fn blacklist_add(ctx: Context<BlacklistManage>, address: Pubkey) -> Result<()> {
        instructions::blacklist::handler_add(ctx, address)
    }

    /// Remove an address from the blacklist. SSS-2 only, requires BLACKLISTER role.
    pub fn blacklist_remove(ctx: Context<BlacklistManage>, address: Pubkey) -> Result<()> {
        instructions::blacklist::handler_remove(ctx, address)
    }

    /// Seize all tokens from a blacklisted account. SSS-2 only, requires SEIZER role.
    pub fn seize(ctx: Context<SeizeTokens>) -> Result<()> {
        instructions::seize::handler(ctx)
    }
}
