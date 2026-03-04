use anchor_lang::prelude::*;

use crate::state::*;
use crate::errors::*;
use crate::utils::*;

// ========== ADD TO BLACKLIST ==========

#[derive(Accounts)]
#[instruction(address: Pubkey, reason: String)]
pub struct AddToBlacklist<'info> {
    #[account(
        seeds = [b"stablecoin", stablecoin_state.mint.as_ref()],
        bump = stablecoin_state.bump,
        constraint = stablecoin_state.compliance_enabled @ StablecoinError::ComplianceNotEnabled
    )]
    pub stablecoin_state: Account<'info, StablecoinState>,
    
    #[account(
        seeds = [b"role", stablecoin_state.key().as_ref(), &[1u8], blacklister.key().as_ref()],
        bump = role_account.bump,
        constraint = role_account.is_active @ StablecoinError::Unauthorized
    )]
    pub role_account: Account<'info, RoleAccount>,
    
    #[account(
        init,
        payer = blacklister,
        space = BlacklistEntry::LEN,
        seeds = [b"blacklist", stablecoin_state.key().as_ref(), address.as_ref()],
        bump
    )]
    pub blacklist_entry: Account<'info, BlacklistEntry>,
    
    #[account(mut)]
    pub blacklister: Signer<'info>,
    
    pub system_program: Program<'info, System>,
}

pub fn add_handler(
    ctx: Context<AddToBlacklist>,
    address: Pubkey,
    reason: String,
) -> Result<()> {
    // Validate reason length
    require!(reason.len() <= 200, StablecoinError::ReasonTooLong);
    
    let blacklist_entry = &mut ctx.accounts.blacklist_entry;
    
    // Initialize blacklist entry
    blacklist_entry.address = address;
    
    // Convert reason to fixed-size byte array
    let mut reason_bytes = [0u8; 200];
    let reason_len = reason.len().min(200);
    reason_bytes[..reason_len].copy_from_slice(&reason.as_bytes()[..reason_len]);
    blacklist_entry.reason = reason_bytes;
    
    blacklist_entry.blacklisted_at = Clock::get()?.unix_timestamp;
    blacklist_entry.blacklisted_by = ctx.accounts.blacklister.key();
    blacklist_entry.is_active = true;
    blacklist_entry.bump = ctx.bumps.blacklist_entry;
    
    // Emit audit event
    emit_audit_event(
        "BLACKLIST_ADD",
        ctx.accounts.blacklister.key(),
        address,
        0,
        &format!("Blacklisted: {}", reason),
    );
    
    // Emit event
    emit!(AddressBlacklisted {
        mint: ctx.accounts.stablecoin_state.mint,
        address,
        reason,
        blacklister: ctx.accounts.blacklister.key(),
        timestamp: Clock::get()?.unix_timestamp,
    });
    
    msg!("Added {} to blacklist", address);
    
    Ok(())
}

// ========== REMOVE FROM BLACKLIST ==========

#[derive(Accounts)]
#[instruction(address: Pubkey)]
pub struct RemoveFromBlacklist<'info> {
    #[account(
        seeds = [b"stablecoin", stablecoin_state.mint.as_ref()],
        bump = stablecoin_state.bump,
        constraint = stablecoin_state.compliance_enabled @ StablecoinError::ComplianceNotEnabled
    )]
    pub stablecoin_state: Account<'info, StablecoinState>,
    
    #[account(
        seeds = [b"role", stablecoin_state.key().as_ref(), &[1u8], blacklister.key().as_ref()],
        bump = role_account.bump,
        constraint = role_account.is_active @ StablecoinError::Unauthorized
    )]
    pub role_account: Account<'info, RoleAccount>,
    
    #[account(
        mut,
        seeds = [b"blacklist", stablecoin_state.key().as_ref(), address.as_ref()],
        bump = blacklist_entry.bump,
        constraint = blacklist_entry.is_active @ StablecoinError::AddressNotBlacklisted
    )]
    pub blacklist_entry: Account<'info, BlacklistEntry>,
    
    pub blacklister: Signer<'info>,
}

pub fn remove_handler(
    ctx: Context<RemoveFromBlacklist>,
    address: Pubkey,
) -> Result<()> {
    let blacklist_entry = &mut ctx.accounts.blacklist_entry;
    
    // Deactivate blacklist entry
    blacklist_entry.is_active = false;
    
    // Emit audit event
    emit_audit_event(
        "BLACKLIST_REMOVE",
        ctx.accounts.blacklister.key(),
        address,
        0,
        "Removed from blacklist",
    );
    
    // Emit event
    emit!(AddressRemovedFromBlacklist {
        mint: ctx.accounts.stablecoin_state.mint,
        address,
        blacklister: ctx.accounts.blacklister.key(),
        timestamp: Clock::get()?.unix_timestamp,
    });
    
    msg!("Removed {} from blacklist", address);
    
    Ok(())
}

#[event]
pub struct AddressBlacklisted {
    pub mint: Pubkey,
    pub address: Pubkey,
    pub reason: String,
    pub blacklister: Pubkey,
    pub timestamp: i64,
}

#[event]
pub struct AddressRemovedFromBlacklist {
    pub mint: Pubkey,
    pub address: Pubkey,
    pub blacklister: Pubkey,
    pub timestamp: i64,
}
