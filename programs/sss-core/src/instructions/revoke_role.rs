use anchor_lang::prelude::*;

use crate::error::SssError;
use crate::events::RoleRevoked;
use crate::state::{RoleAccount, StablecoinConfig};

#[derive(Accounts)]
pub struct RevokeRole<'info> {
    #[account(
        mut,
        constraint = admin.key() == config.admin @ SssError::Unauthorized,
    )]
    pub admin: Signer<'info>,

    #[account(
        seeds = [b"sss_config", config.mint.as_ref()],
        bump = config.bump,
    )]
    pub config: Account<'info, StablecoinConfig>,

    /// CHECK: The wallet whose role is being revoked
    pub holder: UncheckedAccount<'info>,

    #[account(
        mut,
        close = admin,
        seeds = [
            b"sss_role",
            config.key().as_ref(),
            holder.key().as_ref(),
            &[role_account.role.discriminant()],
        ],
        bump = role_account.bump,
    )]
    pub role_account: Account<'info, RoleAccount>,

    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<RevokeRole>) -> Result<()> {
    require!(!ctx.accounts.config.paused, SssError::Paused);

    emit!(RoleRevoked {
        config: ctx.accounts.config.key(),
        holder: ctx.accounts.holder.key(),
        role: ctx.accounts.role_account.role.discriminant(),
        revoked_by: ctx.accounts.admin.key(),
    });

    Ok(())
}
