use anchor_lang::prelude::*;

use crate::errors::SssError;
use crate::events::AuthorityNominated;
use crate::state::*;
use crate::utils::require_master_authority;

#[derive(Accounts)]
pub struct NominateAuthority<'info> {
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
        constraint = role_registry.config == config.key() @ SssError::InvalidAuthority,
    )]
    pub role_registry: Account<'info, RoleRegistry>,
}

pub fn handler(ctx: Context<NominateAuthority>, nominated_authority: Pubkey) -> Result<()> {
    require_master_authority(&ctx.accounts.role_registry, &ctx.accounts.authority.key())?;
    require!(
        nominated_authority != ctx.accounts.authority.key(),
        SssError::SameAuthority
    );
    require!(
        nominated_authority != Pubkey::default(),
        SssError::ZeroAuthority
    );

    let clock = Clock::get()?;
    let old_authority = ctx.accounts.config.master_authority;

    let config = &mut ctx.accounts.config;
    config.pending_authority = nominated_authority;
    config.updated_at = clock.unix_timestamp;

    emit!(AuthorityNominated {
        config: config.key(),
        old_authority,
        nominated_authority,
        timestamp: clock.unix_timestamp,
    });

    Ok(())
}
