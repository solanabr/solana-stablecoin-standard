use crate::errors::StablecoinError;
use crate::events::*;
use crate::state::{BlacklistEntry, RoleRegistry, StablecoinConfig};
use anchor_lang::prelude::*;

#[derive(Accounts)]
#[instruction(address: Pubkey)]
pub struct RemoveFromBlacklist<'info> {
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
        mut,
        close = blacklister,
        seeds = [BlacklistEntry::SEED_PREFIX.as_bytes(), config.key().as_ref(), address.as_ref()],
        bump = blacklist_entry.bump
    )]
    pub blacklist_entry: Account<'info, BlacklistEntry>,
    #[account(mut)]
    pub blacklister: Signer<'info>,
}

pub fn remove_from_blacklist(ctx: Context<RemoveFromBlacklist>, address: Pubkey) -> Result<()> {
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

    let blacklist_entry = &ctx.accounts.blacklist_entry;
    require!(
        blacklist_entry.address == address,
        StablecoinError::InvalidRole
    );

    emit!(RemovedFromBlacklist {
        blacklister,
        address,
    });

    Ok(())
}
