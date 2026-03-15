use anchor_lang::prelude::*;

use crate::errors::SssError;
use crate::events::AllowlistAdded;
use crate::state::*;
use crate::utils::require_role;

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct AllowlistAddParams {
    pub reason: String,
}

#[derive(Accounts)]
#[instruction(_params: AllowlistAddParams)]
pub struct AllowlistAdd<'info> {
    #[account(mut)]
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

    #[account(
        init_if_needed,
        payer = authority,
        space = AllowlistEntry::SPACE,
        seeds = [AllowlistEntry::SEED_PREFIX, config.key().as_ref(), address_to_allowlist.key().as_ref()],
        bump,
        constraint = allowlist_entry.config == config.key() || allowlist_entry.config == Pubkey::default() @ SssError::InvalidAuthority,
    )]
    pub allowlist_entry: Account<'info, AllowlistEntry>,

    /// CHECK: The address being allowlisted.
    pub address_to_allowlist: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<AllowlistAdd>, params: AllowlistAddParams) -> Result<()> {
    let config = &ctx.accounts.config;

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
        params.reason.len() <= AllowlistEntry::MAX_REASON_LEN,
        SssError::AllowlistReasonTooLong
    );

    let entry = &ctx.accounts.allowlist_entry;
    require!(
        entry.config == Pubkey::default(),
        SssError::AllowlistEntryExists
    );

    let clock = Clock::get()?;

    let entry = &mut ctx.accounts.allowlist_entry;
    entry.bump = ctx.bumps.allowlist_entry;
    entry.config = config.key();
    entry.address = ctx.accounts.address_to_allowlist.key();
    entry.added_by = ctx.accounts.authority.key();
    entry.added_at = clock.unix_timestamp;
    entry.reason = params.reason.clone();

    emit!(AllowlistAdded {
        config: config.key(),
        address: ctx.accounts.address_to_allowlist.key(),
        added_by: ctx.accounts.authority.key(),
        reason: params.reason,
        timestamp: clock.unix_timestamp,
    });

    let config = &mut ctx.accounts.config;
    config.updated_at = clock.unix_timestamp;

    Ok(())
}
