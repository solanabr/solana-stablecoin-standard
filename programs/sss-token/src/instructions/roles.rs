use anchor_lang::prelude::*;

use crate::state::{MinterState, Role, RoleAssignment, StablecoinState};
use super::SssError;

// --- Update Minter ---

#[derive(Accounts)]
pub struct UpdateMinter<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        mut,
        seeds = [b"stablecoin", stablecoin_state.mint.as_ref()],
        bump = stablecoin_state.bump,
        constraint = stablecoin_state.master_authority == authority.key() @ SssError::Unauthorized,
    )]
    pub stablecoin_state: Account<'info, StablecoinState>,

    /// CHECK: The minter being added/updated.
    pub minter: UncheckedAccount<'info>,

    #[account(
        init_if_needed,
        payer = authority,
        space = 8 + MinterState::INIT_SPACE,
        seeds = [b"minter", stablecoin_state.key().as_ref(), minter.key().as_ref()],
        bump,
    )]
    pub minter_state: Account<'info, MinterState>,

    pub system_program: Program<'info, System>,
}

pub fn update_minter_handler(ctx: Context<UpdateMinter>, quota: Option<u64>) -> Result<()> {
    let minter_state = &mut ctx.accounts.minter_state;
    let is_new = minter_state.stablecoin == Pubkey::default();

    minter_state.stablecoin = ctx.accounts.stablecoin_state.key();
    minter_state.minter = ctx.accounts.minter.key();
    minter_state.quota = quota;
    minter_state.active = true;
    minter_state.bump = ctx.bumps.minter_state;

    if is_new {
        minter_state.minted = 0;
        ctx.accounts.stablecoin_state.minter_count += 1;
    }

    msg!("SSS: Updated minter {} quota={:?}", minter_state.minter, quota);
    Ok(())
}

// --- Remove Minter ---

#[derive(Accounts)]
pub struct RemoveMinter<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        mut,
        seeds = [b"stablecoin", stablecoin_state.mint.as_ref()],
        bump = stablecoin_state.bump,
        constraint = stablecoin_state.master_authority == authority.key() @ SssError::Unauthorized,
    )]
    pub stablecoin_state: Account<'info, StablecoinState>,

    /// CHECK: The minter being removed.
    pub minter: UncheckedAccount<'info>,

    #[account(
        mut,
        close = authority,
        seeds = [b"minter", stablecoin_state.key().as_ref(), minter.key().as_ref()],
        bump = minter_state.bump,
    )]
    pub minter_state: Account<'info, MinterState>,
}

pub fn remove_minter_handler(ctx: Context<RemoveMinter>) -> Result<()> {
    ctx.accounts.stablecoin_state.minter_count -= 1;
    msg!("SSS: Removed minter {}", ctx.accounts.minter.key());
    Ok(())
}

// --- Update Roles ---

#[derive(Accounts)]
#[instruction(role: Role, assignee: Pubkey)]
pub struct UpdateRoles<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        seeds = [b"stablecoin", stablecoin_state.mint.as_ref()],
        bump = stablecoin_state.bump,
        constraint = stablecoin_state.master_authority == authority.key() @ SssError::Unauthorized,
    )]
    pub stablecoin_state: Account<'info, StablecoinState>,

    #[account(
        init_if_needed,
        payer = authority,
        space = 8 + RoleAssignment::INIT_SPACE,
        seeds = [b"role", stablecoin_state.key().as_ref(), role.seed(), assignee.as_ref()],
        bump,
    )]
    pub role_assignment: Account<'info, RoleAssignment>,

    pub system_program: Program<'info, System>,
}

pub fn update_roles_handler(
    ctx: Context<UpdateRoles>,
    role: Role,
    assignee: Pubkey,
    active: bool,
) -> Result<()> {
    // SSS-2 roles require compliance to be enabled
    if matches!(role, Role::Blacklister | Role::Seizer) {
        require!(
            ctx.accounts.stablecoin_state.compliance_enabled,
            SssError::ComplianceNotEnabled
        );
    }

    let ra = &mut ctx.accounts.role_assignment;
    ra.stablecoin = ctx.accounts.stablecoin_state.key();
    ra.role = role;
    ra.assignee = assignee;
    ra.active = active;
    ra.bump = ctx.bumps.role_assignment;

    msg!("SSS: Role {:?} for {} set to active={}", role, assignee, active);
    Ok(())
}

// --- Transfer Authority ---

#[derive(Accounts)]
pub struct TransferAuthority<'info> {
    pub authority: Signer<'info>,

    #[account(
        mut,
        seeds = [b"stablecoin", stablecoin_state.mint.as_ref()],
        bump = stablecoin_state.bump,
        constraint = stablecoin_state.master_authority == authority.key() @ SssError::Unauthorized,
    )]
    pub stablecoin_state: Account<'info, StablecoinState>,

    /// CHECK: The new authority.
    pub new_authority: UncheckedAccount<'info>,
}

pub fn transfer_authority_handler(ctx: Context<TransferAuthority>) -> Result<()> {
    let state = &mut ctx.accounts.stablecoin_state;
    let old = state.master_authority;
    state.master_authority = ctx.accounts.new_authority.key();
    msg!("SSS: Authority transferred from {} to {}", old, state.master_authority);
    Ok(())
}
