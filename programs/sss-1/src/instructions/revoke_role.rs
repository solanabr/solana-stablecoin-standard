use anchor_lang::prelude::*;

use crate::{
    constants::{CONFIG_SEED, ROLE_SEED},
    error::StablecoinError,
    events::RoleRevoked,
    state::{Role, RoleType, StablecoinConfig},
};

#[derive(Accounts)]
pub struct RevokeRole<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,

    #[account(
        seeds = [CONFIG_SEED, config.mint.as_ref()],
        bump = config.bump,
        constraint = config.admin == admin.key() @ StablecoinError::Unauthorized,
        constraint = config.roles_enabled @ StablecoinError::RolesNotEnabled,
    )]
    pub config: Account<'info, StablecoinConfig>,

    /// CHECK: The authority whose role is being revoked
    pub authority: UncheckedAccount<'info>,

    #[account(
        mut,
        close = admin,
        seeds = [ROLE_SEED, config.key().as_ref(), authority.key().as_ref(), &[role.role_type]],
        bump = role.bump,
        constraint = role.role_type != RoleType::Admin as u8 @ StablecoinError::CannotRevokeAdmin,
    )]
    pub role: Account<'info, Role>,

    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<RevokeRole>) -> Result<()> {
    emit!(RoleRevoked {
        config: ctx.accounts.config.key(),
        authority: ctx.accounts.authority.key(),
        role_type: ctx.accounts.role.role_type,
        revoked_by: ctx.accounts.admin.key(),
    });

    Ok(())
}
