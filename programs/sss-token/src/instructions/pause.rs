use anchor_lang::prelude::*;

use crate::errors::SssError;
use crate::state::*;

#[derive(Accounts)]
pub struct PauseControl<'info> {
    pub authority: Signer<'info>,

    #[account(
        mut,
        seeds = [b"sss_config", config.mint.as_ref()],
        bump = config.bump,
    )]
    pub config: Account<'info, TokenConfig>,

    #[account(
        seeds = [b"sss_role", config.key().as_ref(), authority.key().as_ref()],
        bump = role.bump,
        constraint = role.config == config.key(),
        constraint = role.authority == authority.key(),
    )]
    pub role: Account<'info, RoleAccount>,
}

pub fn handler_pause(ctx: Context<PauseControl>) -> Result<()> {
    require!(
        ctx.accounts.role.has_role(role_flags::ADMIN),
        SssError::Unauthorized
    );
    require!(!ctx.accounts.config.paused, SssError::Paused);

    ctx.accounts.config.paused = true;
    msg!("Token paused by {}", ctx.accounts.authority.key());
    Ok(())
}

pub fn handler_unpause(ctx: Context<PauseControl>) -> Result<()> {
    require!(
        ctx.accounts.role.has_role(role_flags::ADMIN),
        SssError::Unauthorized
    );

    ctx.accounts.config.paused = false;
    msg!("Token unpaused by {}", ctx.accounts.authority.key());
    Ok(())
}
