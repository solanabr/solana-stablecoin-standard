use anchor_lang::prelude::*;

use crate::state::*;
use crate::errors::*;
use crate::utils::*;
use crate::{RoleAction, RoleType};

// ========== UPDATE MINTER ==========

#[derive(Accounts)]
#[instruction(minter: Pubkey, daily_quota: u64, action: RoleAction)]
pub struct UpdateMinter<'info> {
    #[account(
        seeds = [b"stablecoin", stablecoin_state.mint.as_ref()],
        bump = stablecoin_state.bump,
        constraint = stablecoin_state.master_authority == authority.key() @ StablecoinError::Unauthorized
    )]
    pub stablecoin_state: Account<'info, StablecoinState>,
    
    #[account(
        init_if_needed,
        payer = authority,
        space = MinterAccount::LEN,
        seeds = [b"minter", stablecoin_state.key().as_ref(), minter.as_ref()],
        bump
    )]
    pub minter_account: Account<'info, MinterAccount>,
    
    #[account(mut)]
    pub authority: Signer<'info>,
    
    pub system_program: Program<'info, System>,
}

pub fn update_minter_handler(
    ctx: Context<UpdateMinter>,
    minter: Pubkey,
    daily_quota: u64,
    action: RoleAction,
) -> Result<()> {
    let minter_account = &mut ctx.accounts.minter_account;
    
    match action {
        RoleAction::Add => {
            minter_account.minter = minter;
            minter_account.daily_quota = daily_quota;
            minter_account.minted_today = 0;
            minter_account.last_mint_day = 0;
            minter_account.total_minted = 0;
            minter_account.is_active = true;
            minter_account.bump = ctx.bumps.minter_account;
            
            msg!("Added minter: {} with daily quota: {}", minter, daily_quota);
        }
        RoleAction::Remove => {
            minter_account.is_active = false;
            msg!("Removed minter: {}", minter);
        }
    }
    
    // Emit audit event
    emit_audit_event(
        if action == RoleAction::Add { "ADD_MINTER" } else { "REMOVE_MINTER" },
        ctx.accounts.authority.key(),
        minter,
        daily_quota,
        &format!("Minter {} with quota {}", if action == RoleAction::Add { "added" } else { "removed" }, daily_quota),
    );
    
    // Emit event
    emit!(MinterUpdated {
        mint: ctx.accounts.stablecoin_state.mint,
        minter,
        daily_quota,
        action: if action == RoleAction::Add { 0 } else { 1 },
        authority: ctx.accounts.authority.key(),
        timestamp: Clock::get()?.unix_timestamp,
    });
    
    Ok(())
}

// ========== UPDATE ROLES ==========

#[derive(Accounts)]
#[instruction(role_type: RoleType, account: Pubkey, action: RoleAction)]
pub struct UpdateRoles<'info> {
    #[account(
        seeds = [b"stablecoin", stablecoin_state.mint.as_ref()],
        bump = stablecoin_state.bump,
        constraint = stablecoin_state.master_authority == authority.key() @ StablecoinError::Unauthorized
    )]
    pub stablecoin_state: Account<'info, StablecoinState>,
    
    #[account(
        init_if_needed,
        payer = authority,
        space = RoleAccount::LEN,
        seeds = [
            b"role",
            stablecoin_state.key().as_ref(),
            &[role_type_to_u8(&role_type)],
            account.as_ref()
        ],
        bump
    )]
    pub role_account: Account<'info, RoleAccount>,
    
    #[account(mut)]
    pub authority: Signer<'info>,
    
    pub system_program: Program<'info, System>,
}

pub fn update_roles_handler(
    ctx: Context<UpdateRoles>,
    role_type: RoleType,
    account: Pubkey,
    action: RoleAction,
) -> Result<()> {
    let role_account = &mut ctx.accounts.role_account;
    
    // Check if SSS-2 compliance is enabled for blacklister/seizer roles
    if matches!(role_type, RoleType::Blacklister | RoleType::Seizer) {
        require!(
            ctx.accounts.stablecoin_state.compliance_enabled,
            StablecoinError::ComplianceNotEnabled
        );
    }
    
    match action {
        RoleAction::Add => {
            role_account.account = account;
            role_account.role_type = role_type_to_u8(&role_type);
            role_account.is_active = true;
            role_account.bump = ctx.bumps.role_account;
            
            msg!("Added {:?} role to: {}", role_type, account);
        }
        RoleAction::Remove => {
            role_account.is_active = false;
            msg!("Removed {:?} role from: {}", role_type, account);
        }
    }
    
    // Emit audit event
    emit_audit_event(
        &format!("{}_ROLE", if action == RoleAction::Add { "ADD" } else { "REMOVE" }),
        ctx.accounts.authority.key(),
        account,
        0,
        &format!("{:?} role {}", role_type, if action == RoleAction::Add { "added" } else { "removed" }),
    );
    
    // Emit event
    emit!(RoleUpdated {
        mint: ctx.accounts.stablecoin_state.mint,
        account,
        role_type: role_type_to_u8(&role_type),
        action: if action == RoleAction::Add { 0 } else { 1 },
        authority: ctx.accounts.authority.key(),
        timestamp: Clock::get()?.unix_timestamp,
    });
    
    Ok(())
}

// ========== TRANSFER AUTHORITY ==========

#[derive(Accounts)]
#[instruction(new_authority: Pubkey)]
pub struct TransferAuthority<'info> {
    #[account(
        mut,
        seeds = [b"stablecoin", stablecoin_state.mint.as_ref()],
        bump = stablecoin_state.bump,
        constraint = stablecoin_state.master_authority == authority.key() @ StablecoinError::Unauthorized
    )]
    pub stablecoin_state: Account<'info, StablecoinState>,
    
    pub authority: Signer<'info>,
}

pub fn transfer_authority_handler(
    ctx: Context<TransferAuthority>,
    new_authority: Pubkey,
) -> Result<()> {
    let stablecoin_state = &mut ctx.accounts.stablecoin_state;
    let old_authority = stablecoin_state.master_authority;
    
    // Transfer authority
    stablecoin_state.master_authority = new_authority;
    
    // Emit audit event
    emit_audit_event(
        "TRANSFER_AUTHORITY",
        old_authority,
        new_authority,
        0,
        &format!("Authority transferred from {} to {}", old_authority, new_authority),
    );
    
    // Emit event
    emit!(AuthorityTransferred {
        mint: stablecoin_state.mint,
        old_authority,
        new_authority,
        timestamp: Clock::get()?.unix_timestamp,
    });
    
    msg!("Authority transferred from {} to {}", old_authority, new_authority);
    
    Ok(())
}

// Helper function to convert RoleType to u8
fn role_type_to_u8(role_type: &RoleType) -> u8 {
    match role_type {
        RoleType::Burner => 0,
        RoleType::Blacklister => 1,
        RoleType::Pauser => 2,
        RoleType::Seizer => 3,
    }
}

#[event]
pub struct MinterUpdated {
    pub mint: Pubkey,
    pub minter: Pubkey,
    pub daily_quota: u64,
    pub action: u8, // 0: Add, 1: Remove
    pub authority: Pubkey,
    pub timestamp: i64,
}

#[event]
pub struct RoleUpdated {
    pub mint: Pubkey,
    pub account: Pubkey,
    pub role_type: u8,
    pub action: u8, // 0: Add, 1: Remove
    pub authority: Pubkey,
    pub timestamp: i64,
}

#[event]
pub struct AuthorityTransferred {
    pub mint: Pubkey,
    pub old_authority: Pubkey,
    pub new_authority: Pubkey,
    pub timestamp: i64,
}
