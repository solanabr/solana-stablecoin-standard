use anchor_lang::prelude::*;

use crate::constants::*;
use crate::error::SSSError;
use crate::events::{BlacklistAdded, BlacklistRemoved};
use crate::state::*;

#[derive(Accounts)]
#[instruction(target: Pubkey, reason: String)]
pub struct AddToBlacklist<'info> {
    #[account(mut)]
    pub blacklister: Signer<'info>,

    #[account(
        seeds = [STABLECOIN_SEED, stablecoin_config.mint.as_ref()],
        bump = stablecoin_config.bump,
        constraint = stablecoin_config.enable_transfer_hook @ SSSError::ComplianceNotEnabled,
    )]
    pub stablecoin_config: Account<'info, StablecoinConfig>,

    #[account(
        seeds = [ROLES_SEED, stablecoin_config.key().as_ref(), blacklister.key().as_ref()],
        bump = blacklister_roles.bump,
        constraint = blacklister_roles.roles & Role::BLACKLISTER != 0 @ SSSError::Unauthorized,
    )]
    pub blacklister_roles: Account<'info, RoleAccount>,

    #[account(
        init,
        payer = blacklister,
        space = BlacklistEntry::LEN,
        seeds = [BLACKLIST_SEED, stablecoin_config.key().as_ref(), target.as_ref()],
        bump,
    )]
    pub blacklist_entry: Account<'info, BlacklistEntry>,

    pub system_program: Program<'info, System>,
}

pub fn add_to_blacklist_handler(
    ctx: Context<AddToBlacklist>,
    target: Pubkey,
    reason: String,
) -> Result<()> {
    require!(reason.len() <= MAX_REASON_LEN, SSSError::ReasonTooLong);

    let entry = &mut ctx.accounts.blacklist_entry;
    let clock = Clock::get()?;

    entry.stablecoin = ctx.accounts.stablecoin_config.key();
    entry.account = target;
    entry.reason = reason.clone();
    entry.added_by = ctx.accounts.blacklister.key();
    entry.added_at = clock.unix_timestamp;
    entry.bump = ctx.bumps.blacklist_entry;

    emit!(BlacklistAdded {
        mint: ctx.accounts.stablecoin_config.mint,
        account: target,
        reason,
        authority: ctx.accounts.blacklister.key(),
        timestamp: clock.unix_timestamp,
    });

    Ok(())
}

#[derive(Accounts)]
#[instruction(target: Pubkey)]
pub struct RemoveFromBlacklist<'info> {
    #[account(mut)]
    pub blacklister: Signer<'info>,

    #[account(
        seeds = [STABLECOIN_SEED, stablecoin_config.mint.as_ref()],
        bump = stablecoin_config.bump,
        constraint = stablecoin_config.enable_transfer_hook @ SSSError::ComplianceNotEnabled,
    )]
    pub stablecoin_config: Account<'info, StablecoinConfig>,

    #[account(
        seeds = [ROLES_SEED, stablecoin_config.key().as_ref(), blacklister.key().as_ref()],
        bump = blacklister_roles.bump,
        constraint = blacklister_roles.roles & Role::BLACKLISTER != 0 @ SSSError::Unauthorized,
    )]
    pub blacklister_roles: Account<'info, RoleAccount>,

    #[account(
        mut,
        close = blacklister,
        seeds = [BLACKLIST_SEED, stablecoin_config.key().as_ref(), target.as_ref()],
        bump = blacklist_entry.bump,
    )]
    pub blacklist_entry: Account<'info, BlacklistEntry>,
}

pub fn remove_from_blacklist_handler(
    ctx: Context<RemoveFromBlacklist>,
    target: Pubkey,
) -> Result<()> {
    let clock = Clock::get()?;

    emit!(BlacklistRemoved {
        mint: ctx.accounts.stablecoin_config.mint,
        account: target,
        authority: ctx.accounts.blacklister.key(),
        timestamp: clock.unix_timestamp,
    });

    Ok(())
}
