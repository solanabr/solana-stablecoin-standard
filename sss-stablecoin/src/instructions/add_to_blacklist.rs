use crate::errors::StablecoinError;
use crate::events::*;
use crate::state::{BlacklistEntry, RoleRegistry, StablecoinConfig};
use anchor_lang::prelude::*;

#[derive(Accounts)]
#[instruction(address: Pubkey, reason: String)]
pub struct AddToBlacklist<'info> {
    #[account(
        seeds = [StablecoinConfig::SEED_PREFIX.as_bytes(), config.authority.as_ref(), config.symbol.as_bytes()],
        bump = config.bump
    )]
    pub config: Account<'info, StablecoinConfig>,
    #[account(
        seeds = [RoleRegistry::SEED_PREFIX.as_bytes(), config.key().as_ref()],
        bump = role_registry.bump
    )]
    pub role_registry: Account<'info, RoleRegistry>,
    #[account(
        init,
        payer = blacklister,
        space = 8 + BlacklistEntry::LEN,
        seeds = [BlacklistEntry::SEED_PREFIX.as_bytes(), config.key().as_ref(), address.as_ref()],
        bump
    )]
    pub blacklist_entry: Account<'info, BlacklistEntry>,
    #[account(mut)]
    pub blacklister: Signer<'info>,
    pub system_program: Program<'info, System>,
}

pub fn add_to_blacklist(
    ctx: Context<AddToBlacklist>,
    address: Pubkey,
    reason: String,
) -> Result<()> {
    let config = &ctx.accounts.config;
    let role_registry = &ctx.accounts.role_registry;
    let blacklister = ctx.accounts.blacklister.key();

    require!(
        config.enable_transfer_hook,
        StablecoinError::ComplianceNotEnabled
    );

    let is_blacklister =
        role_registry.blacklisters.contains(&blacklister) || role_registry.master == blacklister;
    require!(is_blacklister, StablecoinError::Unauthorized);

    require!(reason.len() <= 128, StablecoinError::InvalidRole);

    let blacklist_entry = &mut ctx.accounts.blacklist_entry;
    blacklist_entry.config = config.key();
    blacklist_entry.address = address;
    blacklist_entry.reason = reason.clone();
    blacklist_entry.blacklisted_at = Clock::get()?.unix_timestamp;
    blacklist_entry.blacklisted_by = blacklister;
    blacklist_entry.bump = ctx.bumps.blacklist_entry;

    emit!(AddedToBlacklist {
        blacklister,
        address,
        reason,
    });

    Ok(())
}
