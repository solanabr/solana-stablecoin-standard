use crate::errors::StablecoinError;
use crate::events::*;
use crate::state::{RoleRegistry, StablecoinConfig};
use anchor_lang::prelude::*;

#[derive(Accounts)]
pub struct ProposeAuthority<'info> {
    #[account(
        mut,
        seeds = [StablecoinConfig::SEED_PREFIX.as_bytes(), config.authority.as_ref(), config.symbol.as_bytes()],
        bump = config.bump
    )]
    pub config: Account<'info, StablecoinConfig>,
    #[account(
        mut,
        seeds = [RoleRegistry::SEED_PREFIX.as_bytes(), config.key().as_ref()],
        bump = role_registry.bump
    )]
    pub role_registry: Account<'info, RoleRegistry>,
    #[account(mut)]
    pub authority: Signer<'info>,
}

pub fn propose_authority(ctx: Context<ProposeAuthority>, new_authority: Pubkey) -> Result<()> {
    let config = &mut ctx.accounts.config;
    let role_registry = &ctx.accounts.role_registry;
    let authority = ctx.accounts.authority.key();

    require!(
        role_registry.master == authority,
        StablecoinError::Unauthorized
    );
    require!(
        config.proposed_authority.is_none(),
        StablecoinError::AuthorityTransferAlreadyProposed
    );

    config.proposed_authority = Some(new_authority);

    emit!(AuthorityTransferProposed {
        current_authority: authority,
        proposed_authority: new_authority,
    });

    Ok(())
}

#[derive(Accounts)]
pub struct AcceptAuthority<'info> {
    #[account(
        mut,
        seeds = [StablecoinConfig::SEED_PREFIX.as_bytes(), old_authority.key().as_ref(), config.symbol.as_bytes()],
        bump = config.bump
    )]
    pub config: Account<'info, StablecoinConfig>,
    #[account(
        mut,
        seeds = [RoleRegistry::SEED_PREFIX.as_bytes(), config.key().as_ref()],
        bump = role_registry.bump
    )]
    pub role_registry: Account<'info, RoleRegistry>,
    pub old_authority: UncheckedAccount<'info>,
    pub new_authority: Signer<'info>,
}

pub fn accept_authority(ctx: Context<AcceptAuthority>) -> Result<()> {
    let config = &mut ctx.accounts.config;
    let role_registry = &mut ctx.accounts.role_registry;
    let new_authority = ctx.accounts.new_authority.key();
    require!(
        ctx.accounts.old_authority.key() == config.authority,
        StablecoinError::Unauthorized
    );

    require!(
        config.proposed_authority.is_some() && config.proposed_authority.unwrap() == new_authority,
        StablecoinError::AuthorityTransferNotProposed
    );

    let old_authority = config.authority;
    config.authority = new_authority;
    config.proposed_authority = None;
    role_registry.master = new_authority;

    emit!(AuthorityTransferAccepted {
        old_authority,
        new_authority,
    });

    Ok(())
}
