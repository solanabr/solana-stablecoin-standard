use anchor_lang::prelude::*;

use crate::errors::SssError;
use crate::events::AuthorityTransferred;
use crate::state::*;
use crate::utils::require_master_authority;

#[derive(Accounts)]
pub struct TransferAuthority<'info> {
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
    )]
    pub role_registry: Account<'info, RoleRegistry>,

    /// CHECK: The new authority pubkey. Validated in handler logic.
    pub new_authority: UncheckedAccount<'info>,
}

pub fn handler(ctx: Context<TransferAuthority>) -> Result<()> {
    let new_authority_key = ctx.accounts.new_authority.key();

    require_master_authority(&ctx.accounts.role_registry, &ctx.accounts.authority.key())?;
    require!(
        new_authority_key != ctx.accounts.authority.key(),
        SssError::SameAuthority
    );
    require!(
        new_authority_key != Pubkey::default(),
        SssError::ZeroAuthority
    );

    let clock = Clock::get()?;
    let old_authority = ctx.accounts.config.master_authority;

    // Update config
    let config = &mut ctx.accounts.config;
    config.master_authority = new_authority_key;
    config.updated_at = clock.unix_timestamp;

    // Update role registry
    let role_registry = &mut ctx.accounts.role_registry;
    role_registry.master_authority = new_authority_key;

    emit!(AuthorityTransferred {
        config: config.key(),
        old_authority,
        new_authority: new_authority_key,
        timestamp: clock.unix_timestamp,
    });

    Ok(())
}
