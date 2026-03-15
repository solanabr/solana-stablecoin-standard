use anchor_lang::prelude::*;

use crate::errors::StablecoinError;
use crate::state::{StablecoinConfig, RoleAssignment, BlacklistEntry, Role};

// ─── Add to Blacklist ────────────────────────────────────────────

#[derive(Accounts)]
#[instruction(address: Pubkey, reason: String)]
pub struct AddToBlacklist<'info> {
    #[account(mut)]
    pub blacklister: Signer<'info>,

    #[account(
        seeds = [b"stablecoin-config", config.mint.as_ref()],
        bump = config.bump,
        constraint = config.is_compliance_enabled() @ StablecoinError::ComplianceNotEnabled,
    )]
    pub config: Account<'info, StablecoinConfig>,

    #[account(
        seeds = [b"role", config.key().as_ref(), blacklister.key().as_ref()],
        bump = role_assignment.bump,
        constraint = role_assignment.has_role(Role::Blacklister) @ StablecoinError::Unauthorized,
    )]
    pub role_assignment: Account<'info, RoleAssignment>,

    #[account(
        init,
        payer = blacklister,
        space = BlacklistEntry::LEN,
        seeds = [b"blacklist", config.mint.as_ref(), address.as_ref()],
        bump,
    )]
    pub blacklist_entry: Account<'info, BlacklistEntry>,

    pub system_program: Program<'info, System>,
}

pub fn add_handler(ctx: Context<AddToBlacklist>, address: Pubkey, reason: String) -> Result<()> {
    require!(reason.len() <= 64, StablecoinError::ReasonTooLong);

    let entry = &mut ctx.accounts.blacklist_entry;
    entry.bump = ctx.bumps.blacklist_entry;
    entry.mint = ctx.accounts.config.mint;
    entry.address = address;
    entry.created_at = Clock::get()?.slot;
    entry.added_by = ctx.accounts.blacklister.key();

    // Copy reason into fixed-size array
    let mut reason_bytes = [0u8; 64];
    let reason_slice = reason.as_bytes();
    reason_bytes[..reason_slice.len()].copy_from_slice(reason_slice);
    entry.reason = reason_bytes;

    msg!(
        "Address {} added to blacklist for mint {} (reason: {})",
        address,
        ctx.accounts.config.mint,
        reason
    );
    Ok(())
}

// ─── Remove from Blacklist ───────────────────────────────────────

#[derive(Accounts)]
#[instruction(address: Pubkey)]
pub struct RemoveFromBlacklist<'info> {
    #[account(mut)]
    pub blacklister: Signer<'info>,

    #[account(
        seeds = [b"stablecoin-config", config.mint.as_ref()],
        bump = config.bump,
        constraint = config.is_compliance_enabled() @ StablecoinError::ComplianceNotEnabled,
    )]
    pub config: Account<'info, StablecoinConfig>,

    #[account(
        seeds = [b"role", config.key().as_ref(), blacklister.key().as_ref()],
        bump = role_assignment.bump,
        constraint = role_assignment.has_role(Role::Blacklister) @ StablecoinError::Unauthorized,
    )]
    pub role_assignment: Account<'info, RoleAssignment>,

    #[account(
        mut,
        close = blacklister,
        seeds = [b"blacklist", config.mint.as_ref(), address.as_ref()],
        bump = blacklist_entry.bump,
        constraint = blacklist_entry.address == address @ StablecoinError::NotBlacklisted,
    )]
    pub blacklist_entry: Account<'info, BlacklistEntry>,
}

pub fn remove_handler(ctx: Context<RemoveFromBlacklist>, address: Pubkey) -> Result<()> {
    msg!(
        "Address {} removed from blacklist for mint {}",
        address,
        ctx.accounts.config.mint
    );
    Ok(())
}
