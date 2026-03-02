use anchor_lang::prelude::*;

use crate::constants::*;
use crate::error::SssError;
use crate::state::*;

#[derive(Accounts)]
#[instruction(target: Pubkey)]
pub struct AddToBlacklist<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    /// CHECK: used as seed only
    pub mint: AccountInfo<'info>,

    #[account(
        seeds = [STABLECOIN_CONFIG_SEED, mint.key().as_ref()],
        bump = stablecoin_config.bump,
    )]
    pub stablecoin_config: Account<'info, StablecoinConfig>,

    #[account(
        seeds = [ROLES_CONFIG_SEED, mint.key().as_ref()],
        bump = roles_config.bump,
    )]
    pub roles_config: Account<'info, RolesConfig>,

    #[account(
        init,
        payer = authority,
        space = BlacklistEntry::LEN,
        seeds = [BLACKLIST_SEED, mint.key().as_ref(), target.as_ref()],
        bump
    )]
    pub blacklist_entry: Account<'info, BlacklistEntry>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(target: Pubkey)]
pub struct RemoveFromBlacklist<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    /// CHECK: used as seed only
    pub mint: AccountInfo<'info>,

    #[account(
        seeds = [STABLECOIN_CONFIG_SEED, mint.key().as_ref()],
        bump = stablecoin_config.bump,
    )]
    pub stablecoin_config: Account<'info, StablecoinConfig>,

    #[account(
        seeds = [ROLES_CONFIG_SEED, mint.key().as_ref()],
        bump = roles_config.bump,
    )]
    pub roles_config: Account<'info, RolesConfig>,

    #[account(
        mut,
        close = authority,
        seeds = [BLACKLIST_SEED, mint.key().as_ref(), target.as_ref()],
        bump = blacklist_entry.bump,
    )]
    pub blacklist_entry: Account<'info, BlacklistEntry>,
}

pub fn add_handler(ctx: Context<AddToBlacklist>, target: Pubkey, reason: u8) -> Result<()> {
    let caller = ctx.accounts.authority.key();
    let roles = &ctx.accounts.roles_config;
    let config = &ctx.accounts.stablecoin_config;

    require!(config.permanent_delegate_enabled, SssError::Sss2NotEnabled);
    require!(
        caller == roles.blacklister || caller == roles.master_authority,
        SssError::Unauthorized
    );

    let clock = Clock::get()?;
    let entry = &mut ctx.accounts.blacklist_entry;
    entry.mint = ctx.accounts.mint.key();
    entry.address = target;
    entry.added_at = clock.unix_timestamp;
    entry.added_by = caller;
    entry.reason = reason;
    entry.bump = ctx.bumps.blacklist_entry;

    msg!("Blacklisted: {} (reason={})", target, reason);
    Ok(())
}

pub fn remove_handler(ctx: Context<RemoveFromBlacklist>, _target: Pubkey) -> Result<()> {
    let caller = ctx.accounts.authority.key();
    let roles = &ctx.accounts.roles_config;

    require!(
        caller == roles.blacklister || caller == roles.master_authority,
        SssError::Unauthorized
    );

    msg!("Removed from blacklist: {}", ctx.accounts.blacklist_entry.address);
    Ok(())
}
