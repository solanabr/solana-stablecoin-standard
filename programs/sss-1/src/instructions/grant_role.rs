use anchor_lang::prelude::*;

use crate::{
    constants::{CONFIG_SEED, ROLE_SEED},
    error::StablecoinError,
    events::RoleGranted,
    state::{Role, RoleType, StablecoinConfig},
};

#[derive(Accounts)]
#[instruction(role_type: u8)]
pub struct GrantRole<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,

    #[account(
        seeds = [CONFIG_SEED, config.mint.as_ref()],
        bump = config.bump,
        constraint = config.admin == admin.key() @ StablecoinError::Unauthorized,
        constraint = config.roles_enabled @ StablecoinError::RolesNotEnabled,
    )]
    pub config: Account<'info, StablecoinConfig>,

    /// CHECK: The authority to grant the role to
    pub authority: UncheckedAccount<'info>,

    #[account(
        init,
        payer = admin,
        space = Role::LEN,
        seeds = [ROLE_SEED, config.key().as_ref(), authority.key().as_ref(), &[role_type]],
        bump,
    )]
    pub role: Account<'info, Role>,

    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<GrantRole>, role_type: u8) -> Result<()> {
    // Cannot grant Admin role through this instruction
    require!(
        role_type != RoleType::Admin as u8,
        StablecoinError::CannotGrantAdmin
    );

    // Validate role_type is a known value
    require!(role_type <= 4, StablecoinError::InvalidRoleType);

    let clock = Clock::get()?;

    let role = &mut ctx.accounts.role;
    role.role_type = role_type;
    role.config = ctx.accounts.config.key();
    role.authority = ctx.accounts.authority.key();
    role.granted_by = ctx.accounts.admin.key();
    role.granted_at = clock.unix_timestamp;
    role.bump = ctx.bumps.role;

    emit!(RoleGranted {
        config: ctx.accounts.config.key(),
        authority: ctx.accounts.authority.key(),
        role_type,
        granted_by: ctx.accounts.admin.key(),
    });

    Ok(())
}
