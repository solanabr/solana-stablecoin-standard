use anchor_lang::prelude::*;
use anchor_spl::{
    token_2022::{self, ThawAccount, Token2022},
    token_interface::TokenAccount,
};

use crate::errors::SssError;
use crate::events::BlacklistRemoved;
use crate::state::*;
use crate::utils::{require_not_paused, require_role};

#[derive(Accounts)]
pub struct BlacklistRemove<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
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

    #[account(
        mut,
        close = authority,
        seeds = [BlacklistEntry::SEED_PREFIX, config.key().as_ref(), blacklist_entry.blocked_address.as_ref()],
        bump = blacklist_entry.bump,
        constraint = blacklist_entry.config == config.key(),
    )]
    pub blacklist_entry: Account<'info, BlacklistEntry>,

    /// CHECK: The Token-2022 mint account. Address validated against config, owner against Token-2022.
    #[account(
        address = config.mint,
        constraint = mint.owner == &token_program.key() @ SssError::InvalidAuthority,
    )]
    pub mint: UncheckedAccount<'info>,

    /// The target's token account to thaw — must belong to the blacklisted address
    #[account(
        mut,
        token::mint = config.mint,
        token::authority = blacklist_entry.blocked_address,
        token::token_program = token_program,
    )]
    pub target_token_account: InterfaceAccount<'info, TokenAccount>,

    pub token_program: Program<'info, Token2022>,
}

pub fn handler(ctx: Context<BlacklistRemove>) -> Result<()> {
    let config = &ctx.accounts.config;
    require_not_paused(config)?;

    require!(
        config.enable_permanent_delegate,
        SssError::BlacklistNotEnabled
    );

    require_role(
        &ctx.accounts.role_registry,
        &ctx.accounts.authority.key(),
        Role::Blacklister,
    )?;

    let clock = Clock::get()?;
    let unblocked_address = ctx.accounts.blacklist_entry.blocked_address;

    // Thaw the target's token account before closing blacklist entry
    let mint_key = config.mint;
    let signer_seeds: &[&[&[u8]]] = &[&[
        StablecoinConfig::SEED_PREFIX,
        mint_key.as_ref(),
        &[config.bump],
    ]];

    token_2022::thaw_account(CpiContext::new_with_signer(
        ctx.accounts.token_program.to_account_info(),
        ThawAccount {
            account: ctx.accounts.target_token_account.to_account_info(),
            mint: ctx.accounts.mint.to_account_info(),
            authority: ctx.accounts.config.to_account_info(),
        },
        signer_seeds,
    ))?;

    // Blacklist entry is closed via the `close` constraint above

    emit!(BlacklistRemoved {
        config: config.key(),
        unblocked_address,
        removed_by: ctx.accounts.authority.key(),
        timestamp: clock.unix_timestamp,
    });

    Ok(())
}
