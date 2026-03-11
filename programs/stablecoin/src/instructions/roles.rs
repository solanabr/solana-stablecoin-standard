use anchor_lang::prelude::*;

use crate::state::*;
use crate::errors::SSSError;
use crate::events::{RoleEvent, RoleAction};

// ============ Assign Role ============

#[derive(Accounts)]
#[instruction(role: Role, assignee: Pubkey)]
pub struct AssignRole<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        mut,
        seeds = [b"config", config.mint.as_ref()],
        bump = config.bump,
    )]
    pub config: Account<'info, StablecoinConfig>,

    #[account(
        init,
        payer = authority,
        space = RoleAssignment::SPACE,
        seeds = [b"role", config.mint.as_ref(), role.as_bytes(), assignee.as_ref()],
        bump,
    )]
    pub role_assignment: Account<'info, RoleAssignment>,

    pub system_program: Program<'info, System>,
}

pub fn assign_role_handler(ctx: Context<AssignRole>, role: Role, assignee: Pubkey) -> Result<()> {
    let config = &mut ctx.accounts.config;
    let authority_key = ctx.accounts.authority.key();

    // Authorization check
    match role {
        Role::Minter => {
            require!(
                authority_key == config.owner || authority_key == config.master_minter,
                SSSError::Unauthorized
            );
        }
        _ => {
            require!(authority_key == config.owner, SSSError::Unauthorized);
        }
    }

    // Update config authorities for non-minter roles
    match role {
        Role::MasterMinter => config.master_minter = assignee,
        Role::Pauser => config.pauser = assignee,
        Role::Blacklister => config.blacklister = assignee,
        _ => {} // Minter and Owner handled separately
    }

    let assignment = &mut ctx.accounts.role_assignment;
    assignment.mint = config.mint;
    assignment.role = role;
    assignment.assignee = assignee;
    assignment.assigned_by = authority_key;
    assignment.assigned_at = Clock::get()?.unix_timestamp;
    assignment.bump = ctx.bumps.role_assignment;

    emit!(RoleEvent {
        mint: config.mint,
        role,
        assignee,
        action: RoleAction::Assigned,
        by: authority_key,
        timestamp: Clock::get()?.unix_timestamp,
    });

    Ok(())
}

// ============ Revoke Role ============

#[derive(Accounts)]
#[instruction(role: Role, assignee: Pubkey)]
pub struct RevokeRole<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        mut,
        seeds = [b"config", config.mint.as_ref()],
        bump = config.bump,
    )]
    pub config: Account<'info, StablecoinConfig>,

    #[account(
        mut,
        close = authority,
        seeds = [b"role", config.mint.as_ref(), role.as_bytes(), assignee.as_ref()],
        bump = role_assignment.bump,
    )]
    pub role_assignment: Account<'info, RoleAssignment>,

    pub system_program: Program<'info, System>,
}

pub fn revoke_role_handler(ctx: Context<RevokeRole>, role: Role, _assignee: Pubkey) -> Result<()> {
    let config = &ctx.accounts.config;
    let authority_key = ctx.accounts.authority.key();

    match role {
        Role::Minter => {
            require!(
                authority_key == config.owner || authority_key == config.master_minter,
                SSSError::Unauthorized
            );
        }
        _ => {
            require!(authority_key == config.owner, SSSError::Unauthorized);
        }
    }

    emit!(RoleEvent {
        mint: config.mint,
        role,
        assignee: ctx.accounts.role_assignment.assignee,
        action: RoleAction::Revoked,
        by: authority_key,
        timestamp: Clock::get()?.unix_timestamp,
    });

    Ok(())
}

// ============ Add Minter (with allowance) ============

#[derive(Accounts)]
#[instruction(minter: Pubkey, allowance: u64)]
pub struct AddMinter<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        seeds = [b"config", config.mint.as_ref()],
        bump = config.bump,
        constraint = (config.owner == authority.key() || config.master_minter == authority.key()) @ SSSError::Unauthorized,
    )]
    pub config: Account<'info, StablecoinConfig>,

    #[account(
        init,
        payer = authority,
        space = MinterAllowance::SPACE,
        seeds = [b"minter", config.mint.as_ref(), minter.as_ref()],
        bump,
    )]
    pub minter_allowance: Account<'info, MinterAllowance>,

    pub system_program: Program<'info, System>,
}

pub fn add_minter_handler(ctx: Context<AddMinter>, minter: Pubkey, allowance: u64) -> Result<()> {
    let config = &ctx.accounts.config;
    let ma = &mut ctx.accounts.minter_allowance;

    ma.mint = config.mint;
    ma.minter = minter;
    ma.allowance = allowance;
    ma.total_minted = 0;
    ma.is_active = true;
    ma.bump = ctx.bumps.minter_allowance;

    emit!(RoleEvent {
        mint: config.mint,
        role: Role::Minter,
        assignee: minter,
        action: RoleAction::Assigned,
        by: ctx.accounts.authority.key(),
        timestamp: Clock::get()?.unix_timestamp,
    });

    Ok(())
}

// ============ Remove Minter ============

#[derive(Accounts)]
pub struct RemoveMinter<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        seeds = [b"config", config.mint.as_ref()],
        bump = config.bump,
        constraint = (config.owner == authority.key() || config.master_minter == authority.key()) @ SSSError::Unauthorized,
    )]
    pub config: Account<'info, StablecoinConfig>,

    #[account(
        mut,
        close = authority,
        seeds = [b"minter", config.mint.as_ref(), minter_allowance.minter.as_ref()],
        bump = minter_allowance.bump,
    )]
    pub minter_allowance: Account<'info, MinterAllowance>,

    pub system_program: Program<'info, System>,
}

pub fn remove_minter_handler(ctx: Context<RemoveMinter>) -> Result<()> {
    emit!(RoleEvent {
        mint: ctx.accounts.config.mint,
        role: Role::Minter,
        assignee: ctx.accounts.minter_allowance.minter,
        action: RoleAction::Revoked,
        by: ctx.accounts.authority.key(),
        timestamp: Clock::get()?.unix_timestamp,
    });

    Ok(())
}

// ============ Update Minter Allowance ============

#[derive(Accounts)]
pub struct UpdateMinterAllowance<'info> {
    pub authority: Signer<'info>,

    #[account(
        seeds = [b"config", config.mint.as_ref()],
        bump = config.bump,
        constraint = config.master_minter == authority.key() @ SSSError::Unauthorized,
    )]
    pub config: Account<'info, StablecoinConfig>,

    #[account(
        mut,
        seeds = [b"minter", config.mint.as_ref(), minter_allowance.minter.as_ref()],
        bump = minter_allowance.bump,
    )]
    pub minter_allowance: Account<'info, MinterAllowance>,
}

pub fn update_minter_allowance_handler(
    ctx: Context<UpdateMinterAllowance>,
    new_allowance: u64,
) -> Result<()> {
    ctx.accounts.minter_allowance.allowance = new_allowance;
    Ok(())
}
