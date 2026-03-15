use anchor_lang::prelude::*;

use crate::events::SupplyCapUpdated;
use crate::state::*;
use crate::utils::require_master_authority;

#[derive(Accounts)]
pub struct SetSupplyCap<'info> {
    pub authority: Signer<'info>,

    #[account(
        mut,
        seeds = [StablecoinConfig::SEED_PREFIX, config.mint.as_ref()],
        bump = config.bump,
    )]
    pub config: Account<'info, StablecoinConfig>,

    #[account(
        seeds = [RoleRegistry::SEED_PREFIX, config.key().as_ref()],
        bump = role_registry.bump,
        constraint = role_registry.config == config.key() @ crate::errors::SssError::InvalidAuthority,
    )]
    pub role_registry: Account<'info, RoleRegistry>,
}

pub fn handler(ctx: Context<SetSupplyCap>, new_cap: u64) -> Result<()> {
    require_master_authority(&ctx.accounts.role_registry, &ctx.accounts.authority.key())?;

    let clock = Clock::get()?;
    let config = &mut ctx.accounts.config;
    let old_cap = config.supply_cap;
    config.supply_cap = new_cap;
    config.updated_at = clock.unix_timestamp;

    emit!(SupplyCapUpdated {
        config: config.key(),
        old_cap,
        new_cap,
        timestamp: clock.unix_timestamp,
    });

    Ok(())
}
