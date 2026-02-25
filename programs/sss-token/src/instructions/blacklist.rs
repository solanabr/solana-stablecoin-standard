use anchor_lang::prelude::*;

use crate::{
    constants::*,
    error::SSSError,
    events::{BlacklistAdded, BlacklistRemoved},
    state::{BlacklistEntry, RoleManager, StablecoinConfig},
};

#[derive(Accounts)]
#[instruction(address: Pubkey)]
pub struct AddToBlacklist<'info> {
    #[account(mut)]
    pub blacklister: Signer<'info>,

    #[account(
        seeds = [STABLECOIN_SEED, stablecoin_config.mint.as_ref()],
        bump = stablecoin_config.bump,
    )]
    pub stablecoin_config: Account<'info, StablecoinConfig>,

    #[account(
        seeds = [ROLES_SEED, stablecoin_config.key().as_ref()],
        bump = role_manager.bump,
    )]
    pub role_manager: Account<'info, RoleManager>,

    #[account(
        init,
        payer = blacklister,
        space = BlacklistEntry::LEN,
        seeds = [BLACKLIST_SEED, stablecoin_config.mint.as_ref(), address.as_ref()],
        bump,
    )]
    pub blacklist_entry: Account<'info, BlacklistEntry>,

    pub system_program: Program<'info, System>,
}

pub fn add_to_blacklist_handler(
    ctx: Context<AddToBlacklist>,
    address: Pubkey,
    reason: String,
) -> Result<()> {
    let config = &ctx.accounts.stablecoin_config;
    let roles = &ctx.accounts.role_manager;
    let blacklister_key = ctx.accounts.blacklister.key();
    let mint_key = config.mint;

    require!(config.enable_permanent_delegate, SSSError::ComplianceNotEnabled);
    require!(
        config.authority == blacklister_key || roles.blacklisters.contains(&blacklister_key),
        SSSError::Unauthorized
    );

    require!(reason.len() <= MAX_REASON_LEN, SSSError::ReasonTooLong);

    let entry = &mut ctx.accounts.blacklist_entry;
    entry.address = address;
    entry.stablecoin = ctx.accounts.stablecoin_config.key();
    entry.reason = reason.clone();
    entry.blacklisted_at = Clock::get()?.unix_timestamp;
    entry.blacklisted_by = blacklister_key;
    entry.bump = ctx.bumps.blacklist_entry;

    emit!(BlacklistAdded {
        mint: mint_key,
        address,
        reason,
        by: blacklister_key,
        timestamp: entry.blacklisted_at,
    });

    Ok(())
}

#[derive(Accounts)]
#[instruction(address: Pubkey)]
pub struct RemoveFromBlacklist<'info> {
    #[account(mut)]
    pub blacklister: Signer<'info>,

    #[account(
        seeds = [STABLECOIN_SEED, stablecoin_config.mint.as_ref()],
        bump = stablecoin_config.bump,
    )]
    pub stablecoin_config: Account<'info, StablecoinConfig>,

    #[account(
        seeds = [ROLES_SEED, stablecoin_config.key().as_ref()],
        bump = role_manager.bump,
    )]
    pub role_manager: Account<'info, RoleManager>,

    #[account(
        mut,
        close = blacklister,
        seeds = [BLACKLIST_SEED, stablecoin_config.mint.as_ref(), address.as_ref()],
        bump = blacklist_entry.bump,
    )]
    pub blacklist_entry: Account<'info, BlacklistEntry>,

    pub system_program: Program<'info, System>,
}

pub fn remove_from_blacklist_handler(
    ctx: Context<RemoveFromBlacklist>,
    _address: Pubkey,
) -> Result<()> {
    let config = &ctx.accounts.stablecoin_config;
    let roles = &ctx.accounts.role_manager;
    let blacklister_key = ctx.accounts.blacklister.key();
    let mint_key = config.mint;
    let address = ctx.accounts.blacklist_entry.address;

    require!(config.enable_permanent_delegate, SSSError::ComplianceNotEnabled);

    require!(
        config.authority == blacklister_key || roles.blacklisters.contains(&blacklister_key),
        SSSError::Unauthorized
    );

    emit!(BlacklistRemoved {
        mint: mint_key,
        address,
        by: blacklister_key,
    });

    Ok(())
}
