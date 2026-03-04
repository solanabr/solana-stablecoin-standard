use anchor_lang::prelude::*;

use crate::errors::SssError;
use crate::state::*;

/// Grant a role to a new or existing authority
#[derive(Accounts)]
#[instruction(target: Pubkey, role_flag: u8)]
pub struct GrantRole<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,

    #[account(
        seeds = [b"sss_config", config.mint.as_ref()],
        bump = config.bump,
    )]
    pub config: Account<'info, TokenConfig>,

    #[account(
        seeds = [b"sss_role", config.key().as_ref(), admin.key().as_ref()],
        bump = admin_role.bump,
        constraint = admin_role.config == config.key(),
        constraint = admin_role.authority == admin.key(),
    )]
    pub admin_role: Account<'info, RoleAccount>,

    /// Target's role account — init-if-needed so we can grant roles to new authorities
    #[account(
        init_if_needed,
        payer = admin,
        space = RoleAccount::LEN,
        seeds = [b"sss_role", config.key().as_ref(), target.as_ref()],
        bump,
    )]
    pub target_role: Account<'info, RoleAccount>,

    pub system_program: Program<'info, System>,
}

pub fn handler_grant(ctx: Context<GrantRole>, target: Pubkey, role_flag: u8) -> Result<()> {
    require!(
        ctx.accounts.admin_role.has_role(role_flags::ADMIN),
        SssError::Unauthorized
    );

    // SSS-2 only roles
    let sss2_only = role_flags::BLACKLISTER | role_flags::SEIZER;
    if role_flag & sss2_only != 0 {
        let preset = ctx
            .accounts
            .config
            .preset_enum()
            .ok_or(SssError::InvalidPreset)?;
        require!(preset.is_compliant(), SssError::PresetMismatch);
    }

    let target_role = &mut ctx.accounts.target_role;

    // If this is a fresh account, populate the fixed fields
    if target_role.config == Pubkey::default() {
        target_role.bump = ctx.bumps.target_role;
        target_role.config = ctx.accounts.config.key();
        target_role.authority = target;
        target_role._reserved = [0u8; 32];
    }

    target_role.grant(role_flag);

    msg!("Granted role {} to {}", role_flag, target);
    Ok(())
}

/// Revoke a role from an authority
#[derive(Accounts)]
#[instruction(target: Pubkey, role_flag: u8)]
pub struct RevokeRole<'info> {
    pub admin: Signer<'info>,

    #[account(
        seeds = [b"sss_config", config.mint.as_ref()],
        bump = config.bump,
    )]
    pub config: Account<'info, TokenConfig>,

    #[account(
        seeds = [b"sss_role", config.key().as_ref(), admin.key().as_ref()],
        bump = admin_role.bump,
        constraint = admin_role.config == config.key(),
        constraint = admin_role.authority == admin.key(),
    )]
    pub admin_role: Account<'info, RoleAccount>,

    #[account(
        mut,
        seeds = [b"sss_role", config.key().as_ref(), target.as_ref()],
        bump = target_role.bump,
        constraint = target_role.config == config.key(),
    )]
    pub target_role: Account<'info, RoleAccount>,
}

pub fn handler_revoke(ctx: Context<RevokeRole>, _target: Pubkey, role_flag: u8) -> Result<()> {
    require!(
        ctx.accounts.admin_role.has_role(role_flags::ADMIN),
        SssError::Unauthorized
    );

    // Prevent removing the last admin
    if role_flag & role_flags::ADMIN != 0 && ctx.accounts.target_role.authority == ctx.accounts.admin.key() {
        return err!(SssError::LastAdmin);
    }

    ctx.accounts.target_role.revoke(role_flag);

    msg!(
        "Revoked role {} from {}",
        role_flag,
        ctx.accounts.target_role.authority
    );
    Ok(())
}
