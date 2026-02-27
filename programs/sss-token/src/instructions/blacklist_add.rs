use anchor_lang::prelude::*;
use anchor_spl::{
    token_2022::{self, FreezeAccount, Token2022},
    token_interface::TokenAccount,
};

use crate::errors::SssError;
use crate::events::BlacklistAdded;
use crate::state::*;
use crate::utils::{require_not_paused, require_role};

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct BlacklistAddParams {
    pub reason: String,
}

#[derive(Accounts)]
#[instruction(params: BlacklistAddParams)]
pub struct BlacklistAdd<'info> {
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
    )]
    pub role_registry: Account<'info, RoleRegistry>,

    #[account(
        init,
        payer = authority,
        space = BlacklistEntry::SPACE,
        seeds = [BlacklistEntry::SEED_PREFIX, config.key().as_ref(), address_to_blacklist.key().as_ref()],
        bump,
    )]
    pub blacklist_entry: Account<'info, BlacklistEntry>,

    /// CHECK: The address being blacklisted.
    pub address_to_blacklist: UncheckedAccount<'info>,

    /// CHECK: The Token-2022 mint account.
    #[account(address = config.mint)]
    pub mint: UncheckedAccount<'info>,

    /// The target's token account to freeze
    #[account(
        mut,
        token::mint = config.mint,
        token::authority = address_to_blacklist,
        token::token_program = token_program,
    )]
    pub target_token_account: InterfaceAccount<'info, TokenAccount>,

    pub token_program: Program<'info, Token2022>,
    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<BlacklistAdd>, params: BlacklistAddParams) -> Result<()> {
    let config = &ctx.accounts.config;
    require_not_paused(config)?;

    // Require SSS-2 features
    require!(
        config.enable_permanent_delegate,
        SssError::BlacklistNotEnabled
    );

    require_role(
        &ctx.accounts.role_registry,
        &ctx.accounts.authority.key(),
        Role::Blacklister,
    )?;

    require!(
        params.reason.len() <= BlacklistEntry::MAX_REASON_LEN,
        SssError::ReasonTooLong
    );

    // Cannot blacklist master authority
    require!(
        ctx.accounts.address_to_blacklist.key() != ctx.accounts.role_registry.master_authority,
        SssError::CannotBlacklistAuthority
    );

    let clock = Clock::get()?;

    // Create blacklist entry
    let entry = &mut ctx.accounts.blacklist_entry;
    entry.bump = ctx.bumps.blacklist_entry;
    entry.config = config.key();
    entry.blocked_address = ctx.accounts.address_to_blacklist.key();
    entry.reason = params.reason.clone();
    entry.blacklisted_by = ctx.accounts.authority.key();
    entry.blacklisted_at = clock.unix_timestamp;

    // Also freeze the target's token account
    let mint_key = config.mint;
    let signer_seeds: &[&[&[u8]]] = &[&[
        StablecoinConfig::SEED_PREFIX,
        mint_key.as_ref(),
        &[config.bump],
    ]];

    token_2022::freeze_account(CpiContext::new_with_signer(
        ctx.accounts.token_program.to_account_info(),
        FreezeAccount {
            account: ctx.accounts.target_token_account.to_account_info(),
            mint: ctx.accounts.mint.to_account_info(),
            authority: ctx.accounts.config.to_account_info(),
        },
        signer_seeds,
    ))?;

    emit!(BlacklistAdded {
        config: config.key(),
        blocked_address: ctx.accounts.address_to_blacklist.key(),
        reason: params.reason,
        blacklisted_by: ctx.accounts.authority.key(),
        timestamp: clock.unix_timestamp,
    });

    Ok(())
}
