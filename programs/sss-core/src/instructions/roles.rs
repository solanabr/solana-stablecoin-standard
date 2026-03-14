use anchor_lang::prelude::*;

use crate::constants::*;
use crate::error::StablecoinError;
use crate::events::{RoleGranted, RoleRevoked, QuotaSet};
use crate::state::{StablecoinConfig, RoleAssignment, MinterQuota};

fn validate_role(role: u8) -> Result<()> {
    require!(
        role <= ROLE_SEIZER,
        StablecoinError::InvalidRole
    );
    Ok(())
}

#[derive(Accounts)]
#[instruction(role: u8, holder: Pubkey)]
pub struct GrantRole<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        seeds = [CONFIG_SEED, config.mint.as_ref()],
        bump = config.bump,
        constraint = authority.key() == config.authority @ StablecoinError::Unauthorized,
    )]
    pub config: Account<'info, StablecoinConfig>,

    #[account(
        init_if_needed,
        payer = authority,
        space = RoleAssignment::LEN,
        seeds = [ROLE_SEED, config.key().as_ref(), &[role], holder.as_ref()],
        bump
    )]
    pub role_assignment: Account<'info, RoleAssignment>,

    pub system_program: Program<'info, System>,
}

pub fn grant_role_handler(ctx: Context<GrantRole>, role: u8, holder: Pubkey) -> Result<()> {
    validate_role(role)?;

    // SSS-2 roles (blacklister, seizer) require compliance
    if role == ROLE_BLACKLISTER || role == ROLE_SEIZER {
        require!(
            ctx.accounts.config.compliance_enabled,
            StablecoinError::ComplianceNotEnabled
        );
    }

    let clock = Clock::get()?;

    let assignment = &mut ctx.accounts.role_assignment;
    assignment.config = ctx.accounts.config.key();
    assignment.holder = holder;
    assignment.role = role;
    assignment.active = true;
    assignment.granted_by = ctx.accounts.authority.key();
    assignment.granted_at = clock.unix_timestamp;
    assignment.bump = ctx.bumps.role_assignment;
    assignment._reserved = [0u8; 16];

    emit!(RoleGranted {
        config: ctx.accounts.config.key(),
        role,
        holder,
        grantor: ctx.accounts.authority.key(),
    });

    Ok(())
}

#[derive(Accounts)]
#[instruction(role: u8, holder: Pubkey)]
pub struct RevokeRole<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        seeds = [CONFIG_SEED, config.mint.as_ref()],
        bump = config.bump,
        constraint = authority.key() == config.authority @ StablecoinError::Unauthorized,
    )]
    pub config: Account<'info, StablecoinConfig>,

    #[account(
        mut,
        seeds = [ROLE_SEED, config.key().as_ref(), &[role], holder.as_ref()],
        bump = role_assignment.bump,
        constraint = role_assignment.config == config.key() @ StablecoinError::Unauthorized,
        constraint = role_assignment.active @ StablecoinError::RoleNotActive,
    )]
    pub role_assignment: Account<'info, RoleAssignment>,
}

pub fn revoke_role_handler(ctx: Context<RevokeRole>, role: u8, holder: Pubkey) -> Result<()> {
    validate_role(role)?;

    // Deactivate instead of closing for audit trail
    let assignment = &mut ctx.accounts.role_assignment;
    assignment.active = false;

    emit!(RoleRevoked {
        config: ctx.accounts.config.key(),
        role,
        holder,
        revoker: ctx.accounts.authority.key(),
    });

    Ok(())
}

#[derive(Accounts)]
#[instruction(minter: Pubkey)]
pub struct SetQuota<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        seeds = [CONFIG_SEED, config.mint.as_ref()],
        bump = config.bump,
        constraint = authority.key() == config.authority @ StablecoinError::Unauthorized,
    )]
    pub config: Account<'info, StablecoinConfig>,

    /// Verify minter has the minter role and it's active
    #[account(
        seeds = [ROLE_SEED, config.key().as_ref(), &[ROLE_MINTER], minter.as_ref()],
        bump = minter_role.bump,
        constraint = minter_role.config == config.key() @ StablecoinError::Unauthorized,
        constraint = minter_role.active @ StablecoinError::RoleNotActive,
    )]
    pub minter_role: Account<'info, RoleAssignment>,

    #[account(
        init_if_needed,
        payer = authority,
        space = MinterQuota::LEN,
        seeds = [QUOTA_SEED, config.key().as_ref(), minter.as_ref()],
        bump
    )]
    pub minter_quota: Account<'info, MinterQuota>,

    pub system_program: Program<'info, System>,
}

pub fn set_quota_handler(ctx: Context<SetQuota>, minter: Pubkey, quota_limit: u64) -> Result<()> {
    let quota = &mut ctx.accounts.minter_quota;
    quota.config = ctx.accounts.config.key();
    quota.minter = minter;
    quota.quota_limit = quota_limit;
    // Don't reset minted_amount if already initialized
    if quota.bump == 0 {
        quota.minted_amount = 0;
        quota.bump = ctx.bumps.minter_quota;
    }
    quota._reserved = Default::default();

    emit!(QuotaSet {
        config: ctx.accounts.config.key(),
        minter,
        quota_limit,
    });

    Ok(())
}
