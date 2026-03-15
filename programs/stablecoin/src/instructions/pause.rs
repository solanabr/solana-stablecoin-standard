use anchor_lang::prelude::*;

use crate::errors::StablecoinError;
use crate::state::{StablecoinConfig, RoleAssignment, Role};

#[derive(Accounts)]
pub struct Pause<'info> {
    pub authority: Signer<'info>,

    #[account(
        mut,
        seeds = [b"stablecoin-config", config.mint.as_ref()],
        bump = config.bump,
    )]
    pub config: Account<'info, StablecoinConfig>,

    #[account(
        seeds = [b"role", config.key().as_ref(), authority.key().as_ref()],
        bump = role_assignment.bump,
    )]
    pub role_assignment: Account<'info, RoleAssignment>,
}

pub fn handler(ctx: Context<Pause>) -> Result<()> {
    let is_master = ctx.accounts.authority.key() == ctx.accounts.config.authority;
    let is_pauser = ctx.accounts.role_assignment.has_role(Role::Pauser);
    require!(is_master || is_pauser, StablecoinError::Unauthorized);
    require!(!ctx.accounts.config.paused, StablecoinError::Paused);

    let config = &mut ctx.accounts.config;
    config.paused = true;
    config.updated_at = Clock::get()?.slot;

    msg!("Stablecoin paused by {}", ctx.accounts.authority.key());
    Ok(())
}
