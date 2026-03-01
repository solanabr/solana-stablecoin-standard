use anchor_lang::prelude::*;

use crate::state::{BlacklistEntry, Role, RoleAssignment, StablecoinState};
use super::SssError;

#[derive(Accounts)]
pub struct AddToBlacklist<'info> {
    #[account(mut)]
    pub blacklister: Signer<'info>,

    #[account(
        seeds = [b"stablecoin", stablecoin_state.mint.as_ref()],
        bump = stablecoin_state.bump,
        constraint = stablecoin_state.compliance_enabled @ SssError::ComplianceNotEnabled,
    )]
    pub stablecoin_state: Account<'info, StablecoinState>,

    #[account(
        seeds = [b"role", stablecoin_state.key().as_ref(), Role::Blacklister.seed(), blacklister.key().as_ref()],
        bump = role_assignment.bump,
        constraint = role_assignment.active @ SssError::Unauthorized,
    )]
    pub role_assignment: Account<'info, RoleAssignment>,

    /// CHECK: The address being blacklisted.
    pub target: UncheckedAccount<'info>,

    #[account(
        init,
        payer = blacklister,
        space = 8 + BlacklistEntry::INIT_SPACE,
        seeds = [b"blacklist", stablecoin_state.key().as_ref(), target.key().as_ref()],
        bump,
    )]
    pub blacklist_entry: Account<'info, BlacklistEntry>,

    pub system_program: Program<'info, System>,
}

pub fn add_handler(ctx: Context<AddToBlacklist>, reason: String) -> Result<()> {
    require!(reason.len() <= 128, SssError::ReasonTooLong);

    let entry = &mut ctx.accounts.blacklist_entry;
    entry.stablecoin = ctx.accounts.stablecoin_state.key();
    entry.address = ctx.accounts.target.key();
    entry.reason = reason;
    entry.created_at = Clock::get()?.unix_timestamp;
    entry.bump = ctx.bumps.blacklist_entry;

    msg!("SSS: Added {} to blacklist", entry.address);
    Ok(())
}

#[derive(Accounts)]
pub struct RemoveFromBlacklist<'info> {
    #[account(mut)]
    pub blacklister: Signer<'info>,

    #[account(
        seeds = [b"stablecoin", stablecoin_state.mint.as_ref()],
        bump = stablecoin_state.bump,
        constraint = stablecoin_state.compliance_enabled @ SssError::ComplianceNotEnabled,
    )]
    pub stablecoin_state: Account<'info, StablecoinState>,

    #[account(
        seeds = [b"role", stablecoin_state.key().as_ref(), Role::Blacklister.seed(), blacklister.key().as_ref()],
        bump = role_assignment.bump,
        constraint = role_assignment.active @ SssError::Unauthorized,
    )]
    pub role_assignment: Account<'info, RoleAssignment>,

    /// CHECK: The address being removed from blacklist.
    pub target: UncheckedAccount<'info>,

    #[account(
        mut,
        close = blacklister,
        seeds = [b"blacklist", stablecoin_state.key().as_ref(), target.key().as_ref()],
        bump = blacklist_entry.bump,
    )]
    pub blacklist_entry: Account<'info, BlacklistEntry>,
}

pub fn remove_handler(ctx: Context<RemoveFromBlacklist>) -> Result<()> {
    msg!("SSS: Removed {} from blacklist", ctx.accounts.target.key());
    Ok(())
}
