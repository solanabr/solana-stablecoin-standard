use anchor_lang::prelude::*;

use crate::constants::*;
use crate::error::SssError;
use crate::events::OperationsPaused;
use crate::state::{Role, RoleAccount, StablecoinConfig};

#[derive(Accounts)]
pub struct Pause<'info> {
    pub pauser: Signer<'info>,

    #[account(
        mut,
        seeds = [SSS_CONFIG_SEED, config.mint.as_ref()],
        bump = config.bump,
        constraint = !config.paused @ SssError::Paused,
    )]
    pub config: Account<'info, StablecoinConfig>,

    #[account(
        seeds = [
            SSS_ROLE_SEED,
            config.key().as_ref(),
            pauser.key().as_ref(),
            &[Role::Pauser.as_u8()],
        ],
        bump = pauser_role.bump,
    )]
    pub pauser_role: Account<'info, RoleAccount>,
}

pub fn handler_pause(ctx: Context<Pause>) -> Result<()> {
    let config = &mut ctx.accounts.config;
    config.paused = true;

    emit!(OperationsPaused {
        mint: config.mint,
        pauser: ctx.accounts.pauser.key(),
    });

    Ok(())
}
