use crate::errors::StablecoinError;
use crate::events::*;
use crate::state::{RoleRegistry, StablecoinConfig};
use anchor_lang::prelude::*;

#[derive(Accounts)]
pub struct Unpause<'info> {
    #[account(
        mut,
        seeds = [StablecoinConfig::SEED_PREFIX.as_bytes(), config.authority.as_ref(), config.symbol.as_bytes()],
        bump = config.bump
    )]
    pub config: Account<'info, StablecoinConfig>,
    #[account(
        seeds = [RoleRegistry::SEED_PREFIX.as_bytes(), config.key().as_ref()],
        bump = role_registry.bump
    )]
    pub role_registry: Account<'info, RoleRegistry>,
    #[account(mut)]
    pub authority: Signer<'info>,
}

pub fn unpause(ctx: Context<Unpause>) -> Result<()> {
    let config = &mut ctx.accounts.config;
    let role_registry = &ctx.accounts.role_registry;
    let authority = ctx.accounts.authority.key();

    let is_pauser = role_registry.pausers.contains(&authority) || role_registry.master == authority;
    require!(is_pauser, StablecoinError::Unauthorized);
    require!(config.paused, StablecoinError::NotPaused);

    config.paused = false;

    emit!(Unpaused { authority });

    Ok(())
}
