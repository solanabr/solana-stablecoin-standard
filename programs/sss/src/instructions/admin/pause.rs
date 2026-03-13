use anchor_lang::prelude::*;
use crate::state::*;
use crate::errors::*;
use crate::events::*;

#[derive(Accounts)]
pub struct Pause<'info> {
    #[account(mut)]
    pub pauser: Signer<'info>,

    #[account(mut)]
    pub config: Account<'info, StablecoinConfig>,

    #[account(
        seeds = [b"role", config.key().as_ref(), pauser.key().as_ref()],
        bump,
        constraint = role_registry.has_pauser @ StablecoinError::Unauthorized
    )]
    pub role_registry: Account<'info, RoleRegistry>,
}

pub fn pause_handler(ctx: Context<Pause>, is_paused: bool) -> Result<()> {
    ctx.accounts.config.is_paused = is_paused;

    emit!(PauseEvent {
        config: ctx.accounts.config.key(),
        is_paused,
        by: ctx.accounts.pauser.key(),
    });

    Ok(())
}
