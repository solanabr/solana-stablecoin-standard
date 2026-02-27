use anchor_lang::prelude::*;

use crate::errors::SssError;
use crate::events::ProgramPaused;
use crate::state::*;
use crate::utils::require_role;

#[derive(Accounts)]
pub struct Pause<'info> {
    pub authority: Signer<'info>,

    #[account(
        mut,
        seeds = [StablecoinConfig::SEED_PREFIX, config.mint.as_ref()],
        bump = config.bump,
    )]
    pub config: Account<'info, StablecoinConfig>,

    #[account(
        seeds = [RoleRegistry::SEED_PREFIX, config.key().as_ref()],
        bump = role_registry.bump,
    )]
    pub role_registry: Account<'info, RoleRegistry>,
}

pub fn handler(ctx: Context<Pause>) -> Result<()> {
    let config = &ctx.accounts.config;
    require!(!config.is_paused, SssError::ProgramPaused);
    require_role(
        &ctx.accounts.role_registry,
        &ctx.accounts.authority.key(),
        Role::Pauser,
    )?;

    let clock = Clock::get()?;

    let config = &mut ctx.accounts.config;
    config.is_paused = true;
    config.updated_at = clock.unix_timestamp;

    emit!(ProgramPaused {
        config: config.key(),
        pauser: ctx.accounts.authority.key(),
        timestamp: clock.unix_timestamp,
    });

    Ok(())
}
