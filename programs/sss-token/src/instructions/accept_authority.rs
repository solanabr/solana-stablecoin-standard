use anchor_lang::prelude::*;

use crate::errors::SssError;
use crate::events::AuthorityTransferred;
use crate::state::*;

#[derive(Accounts)]
pub struct AcceptAuthority<'info> {
    pub authority: Signer<'info>,

    #[account(
        mut,
        seeds = [StablecoinConfig::SEED_PREFIX, config.mint.as_ref()],
        bump = config.bump,
    )]
    pub config: Account<'info, StablecoinConfig>,

    #[account(
        mut,
        seeds = [RoleRegistry::SEED_PREFIX, config.key().as_ref()],
        bump = role_registry.bump,
        constraint = role_registry.config == config.key() @ SssError::InvalidAuthority,
    )]
    pub role_registry: Account<'info, RoleRegistry>,
}

pub fn handler(ctx: Context<AcceptAuthority>) -> Result<()> {
    let pending_authority = ctx.accounts.config.pending_authority;
    require!(
        pending_authority != Pubkey::default(),
        SssError::NoPendingAuthority
    );
    require!(
        ctx.accounts.authority.key() == pending_authority,
        SssError::NotPendingAuthority
    );

    let clock = Clock::get()?;
    let old_authority = ctx.accounts.config.master_authority;
    let new_authority = ctx.accounts.authority.key();

    let config = &mut ctx.accounts.config;
    config.master_authority = new_authority;
    config.pending_authority = Pubkey::default();
    config.updated_at = clock.unix_timestamp;

    let role_registry = &mut ctx.accounts.role_registry;
    role_registry.master_authority = new_authority;

    if role_registry.pauser == old_authority {
        role_registry.pauser = new_authority;
    }
    if role_registry.blacklister == old_authority {
        role_registry.blacklister = new_authority;
    }
    if role_registry.seizer == old_authority {
        role_registry.seizer = new_authority;
    }

    emit!(AuthorityTransferred {
        config: config.key(),
        old_authority,
        new_authority,
        timestamp: clock.unix_timestamp,
    });

    Ok(())
}
