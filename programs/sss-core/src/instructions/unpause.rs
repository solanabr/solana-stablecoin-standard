use anchor_lang::prelude::*;

use crate::error::SssError;
use crate::events::StablecoinUnpaused;
use crate::state::{Role, RoleAccount, StablecoinConfig};

#[derive(Accounts)]
pub struct Unpause<'info> {
    pub authority: Signer<'info>,

    #[account(
        mut,
        seeds = [b"sss_config", config.mint.as_ref()],
        bump = config.bump,
    )]
    pub config: Account<'info, StablecoinConfig>,

    /// Optional: Pauser role account. If not provided, authority must be admin.
    #[account(
        seeds = [
            b"sss_role",
            config.key().as_ref(),
            authority.key().as_ref(),
            &[Role::Pauser.discriminant()],
        ],
        bump = role_account.bump,
        constraint = role_account.role == Role::Pauser @ SssError::Unauthorized,
    )]
    pub role_account: Option<Account<'info, RoleAccount>>,
}

pub fn handler(ctx: Context<Unpause>) -> Result<()> {
    require!(ctx.accounts.config.paused, SssError::NotPaused);

    let authority = ctx.accounts.authority.key();
    let is_admin = authority == ctx.accounts.config.admin;
    let is_pauser = ctx.accounts.role_account.is_some();
    require!(is_admin || is_pauser, SssError::Unauthorized);

    ctx.accounts.config.paused = false;

    emit!(StablecoinUnpaused {
        config: ctx.accounts.config.key(),
        unpaused_by: authority,
    });

    Ok(())
}
