use anchor_lang::prelude::*;

use crate::constants::*;
use crate::error::StablecoinError;
use crate::events::{AddressBlacklisted, AddressUnblacklisted};
use crate::state::{StablecoinConfig, RoleAssignment, BlacklistEntry};

#[derive(Accounts)]
#[instruction(address: Pubkey, reason: String)]
pub struct AddToBlacklist<'info> {
    #[account(mut)]
    pub blacklister: Signer<'info>,

    #[account(
        seeds = [CONFIG_SEED, config.mint.as_ref()],
        bump = config.bump,
        constraint = config.compliance_enabled @ StablecoinError::ComplianceNotEnabled,
    )]
    pub config: Account<'info, StablecoinConfig>,

    /// Blacklister role assignment
    #[account(
        seeds = [ROLE_SEED, config.key().as_ref(), &[ROLE_BLACKLISTER], blacklister.key().as_ref()],
        bump = blacklister_role.bump,
        constraint = blacklister_role.config == config.key() @ StablecoinError::Unauthorized,
        constraint = blacklister_role.role == ROLE_BLACKLISTER @ StablecoinError::Unauthorized,
        constraint = blacklister_role.active @ StablecoinError::RoleNotActive,
    )]
    pub blacklister_role: Account<'info, RoleAssignment>,

    #[account(
        init_if_needed,
        payer = blacklister,
        space = BlacklistEntry::LEN,
        seeds = [BLACKLIST_SEED, config.key().as_ref(), address.as_ref()],
        bump
    )]
    pub blacklist_entry: Account<'info, BlacklistEntry>,

    pub system_program: Program<'info, System>,
}

pub fn add_to_blacklist_handler(
    ctx: Context<AddToBlacklist>,
    address: Pubkey,
    reason: String,
) -> Result<()> {
    require!(reason.len() <= MAX_REASON_LEN, StablecoinError::ReasonTooLong);

    // If entry already exists and is active, reject
    let entry = &ctx.accounts.blacklist_entry;
    if entry.bump != 0 && entry.active {
        return Err(StablecoinError::AlreadyBlacklisted.into());
    }

    let clock = Clock::get()?;

    let entry = &mut ctx.accounts.blacklist_entry;
    entry.config = ctx.accounts.config.key();
    entry.address = address;
    entry.reason = reason.clone();
    entry.blacklisted_at = clock.unix_timestamp;
    entry.blacklisted_by = ctx.accounts.blacklister.key();
    entry.active = true;
    entry.bump = ctx.bumps.blacklist_entry;
    entry._reserved = [0u8; 16];

    emit!(AddressBlacklisted {
        config: ctx.accounts.config.key(),
        address,
        blacklister: ctx.accounts.blacklister.key(),
        reason,
    });

    Ok(())
}

#[derive(Accounts)]
#[instruction(address: Pubkey)]
pub struct RemoveFromBlacklist<'info> {
    #[account(mut)]
    pub blacklister: Signer<'info>,

    #[account(
        seeds = [CONFIG_SEED, config.mint.as_ref()],
        bump = config.bump,
        constraint = config.compliance_enabled @ StablecoinError::ComplianceNotEnabled,
    )]
    pub config: Account<'info, StablecoinConfig>,

    /// Blacklister role assignment
    #[account(
        seeds = [ROLE_SEED, config.key().as_ref(), &[ROLE_BLACKLISTER], blacklister.key().as_ref()],
        bump = blacklister_role.bump,
        constraint = blacklister_role.config == config.key() @ StablecoinError::Unauthorized,
        constraint = blacklister_role.role == ROLE_BLACKLISTER @ StablecoinError::Unauthorized,
        constraint = blacklister_role.active @ StablecoinError::RoleNotActive,
    )]
    pub blacklister_role: Account<'info, RoleAssignment>,

    #[account(
        mut,
        seeds = [BLACKLIST_SEED, config.key().as_ref(), address.as_ref()],
        bump = blacklist_entry.bump,
        constraint = blacklist_entry.config == config.key() @ StablecoinError::Unauthorized,
        constraint = blacklist_entry.active @ StablecoinError::NotBlacklisted,
    )]
    pub blacklist_entry: Account<'info, BlacklistEntry>,
}

pub fn remove_from_blacklist_handler(
    ctx: Context<RemoveFromBlacklist>,
    address: Pubkey,
) -> Result<()> {
    // Deactivate instead of closing for audit trail
    let entry = &mut ctx.accounts.blacklist_entry;
    entry.active = false;

    emit!(AddressUnblacklisted {
        config: ctx.accounts.config.key(),
        address,
        blacklister: ctx.accounts.blacklister.key(),
    });

    Ok(())
}
