use anchor_lang::prelude::*;

use crate::constants::*;
use crate::events::{RoleGranted, RoleRevoked};
use crate::state::{Role, RoleAccount, StablecoinConfig};

// ---------------------------------------------------------------------------
// Grant Role
// ---------------------------------------------------------------------------

#[derive(Accounts)]
#[instruction(role: u8)]
pub struct GrantRole<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,

    #[account(
        seeds = [SSS_CONFIG_SEED, config.mint.as_ref()],
        bump = config.bump,
    )]
    pub config: Account<'info, StablecoinConfig>,

    /// Admin's own role PDA — proves admin authorization.
    #[account(
        seeds = [
            SSS_ROLE_SEED,
            config.key().as_ref(),
            admin.key().as_ref(),
            &[Role::Admin.as_u8()],
        ],
        bump = admin_role.bump,
    )]
    pub admin_role: Account<'info, RoleAccount>,

    /// The address receiving the role.
    /// CHECK: Any valid public key can be granted a role.
    pub grantee: UncheckedAccount<'info>,

    #[account(
        init,
        payer = admin,
        space = ROLE_SPACE,
        seeds = [
            SSS_ROLE_SEED,
            config.key().as_ref(),
            grantee.key().as_ref(),
            &[role],
        ],
        bump,
    )]
    pub role_account: Account<'info, RoleAccount>,

    pub system_program: Program<'info, System>,
}

pub fn handler_grant(ctx: Context<GrantRole>, role: u8) -> Result<()> {
    let role_enum = match role {
        0 => Role::Admin,
        1 => Role::Minter,
        2 => Role::Freezer,
        3 => Role::Pauser,
        _ => return Err(error!(crate::error::SssError::InvalidRole)),
    };

    let role_account = &mut ctx.accounts.role_account;
    role_account.config = ctx.accounts.config.key();
    role_account.address = ctx.accounts.grantee.key();
    role_account.role = role_enum;
    role_account.granted_by = ctx.accounts.admin.key();
    role_account.granted_at = Clock::get()?.unix_timestamp;
    role_account.bump = ctx.bumps.role_account;

    emit!(RoleGranted {
        config: ctx.accounts.config.key(),
        address: ctx.accounts.grantee.key(),
        role,
        granted_by: ctx.accounts.admin.key(),
    });

    Ok(())
}

// ---------------------------------------------------------------------------
// Revoke Role
// ---------------------------------------------------------------------------

#[derive(Accounts)]
pub struct RevokeRole<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,

    #[account(
        seeds = [SSS_CONFIG_SEED, config.mint.as_ref()],
        bump = config.bump,
    )]
    pub config: Account<'info, StablecoinConfig>,

    /// Admin's own role PDA — proves admin authorization.
    #[account(
        seeds = [
            SSS_ROLE_SEED,
            config.key().as_ref(),
            admin.key().as_ref(),
            &[Role::Admin.as_u8()],
        ],
        bump = admin_role.bump,
    )]
    pub admin_role: Account<'info, RoleAccount>,

    /// The role PDA being revoked. Closed and rent returned to admin.
    #[account(
        mut,
        close = admin,
        constraint = role_account.config == config.key(),
    )]
    pub role_account: Account<'info, RoleAccount>,
}

pub fn handler_revoke(ctx: Context<RevokeRole>) -> Result<()> {
    emit!(RoleRevoked {
        config: ctx.accounts.config.key(),
        address: ctx.accounts.role_account.address,
        role: ctx.accounts.role_account.role.as_u8(),
        revoked_by: ctx.accounts.admin.key(),
    });

    Ok(())
}
