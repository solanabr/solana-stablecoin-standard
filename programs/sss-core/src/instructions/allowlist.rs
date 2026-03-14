use anchor_lang::prelude::*;

use crate::constants::*;
use crate::error::StablecoinError;
use crate::events::{AllowlistAdded, AllowlistRemoved};
use crate::state::{StablecoinConfig, AllowlistEntry};

#[derive(Accounts)]
#[instruction(address: Pubkey)]
pub struct AddToAllowlist<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        seeds = [CONFIG_SEED, config.mint.as_ref()],
        bump = config.bump,
        constraint = authority.key() == config.authority @ StablecoinError::Unauthorized,
        constraint = config.enable_allowlist @ StablecoinError::AllowlistNotEnabled,
    )]
    pub config: Account<'info, StablecoinConfig>,

    #[account(
        init,
        payer = authority,
        space = AllowlistEntry::LEN,
        seeds = [ALLOWLIST_SEED, config.key().as_ref(), address.as_ref()],
        bump
    )]
    pub allowlist_entry: Account<'info, AllowlistEntry>,

    pub system_program: Program<'info, System>,
}

pub fn add_to_allowlist_handler(
    ctx: Context<AddToAllowlist>,
    address: Pubkey,
) -> Result<()> {
    let clock = Clock::get()?;

    let entry = &mut ctx.accounts.allowlist_entry;
    entry.config = ctx.accounts.config.key();
    entry.address = address;
    entry.added_at = clock.unix_timestamp;
    entry.added_by = ctx.accounts.authority.key();
    entry.bump = ctx.bumps.allowlist_entry;

    emit!(AllowlistAdded {
        config: ctx.accounts.config.key(),
        address,
        added_by: ctx.accounts.authority.key(),
    });

    Ok(())
}

#[derive(Accounts)]
#[instruction(address: Pubkey)]
pub struct RemoveFromAllowlist<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        seeds = [CONFIG_SEED, config.mint.as_ref()],
        bump = config.bump,
        constraint = authority.key() == config.authority @ StablecoinError::Unauthorized,
        constraint = config.enable_allowlist @ StablecoinError::AllowlistNotEnabled,
    )]
    pub config: Account<'info, StablecoinConfig>,

    #[account(
        mut,
        close = authority,
        seeds = [ALLOWLIST_SEED, config.key().as_ref(), address.as_ref()],
        bump = allowlist_entry.bump,
        constraint = allowlist_entry.config == config.key() @ StablecoinError::Unauthorized,
    )]
    pub allowlist_entry: Account<'info, AllowlistEntry>,
}

pub fn remove_from_allowlist_handler(
    ctx: Context<RemoveFromAllowlist>,
    address: Pubkey,
) -> Result<()> {
    emit!(AllowlistRemoved {
        config: ctx.accounts.config.key(),
        address,
        removed_by: ctx.accounts.authority.key(),
    });

    Ok(())
}
