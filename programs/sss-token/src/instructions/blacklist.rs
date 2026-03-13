use anchor_lang::prelude::*;

use crate::errors::SssError;
use crate::state::blacklist::MAX_REASON_LEN;
use crate::state::{BlacklistEntry, RoleManager, StablecoinConfig};

/// Accounts for the add_to_blacklist instruction.
#[derive(Accounts)]
#[instruction(reason: String)]
pub struct AddToBlacklist<'info> {
    /// The blacklister signing the transaction.
    #[account(mut)]
    pub blacklister: Signer<'info>,

    /// The stablecoin configuration.
    #[account(
        seeds = [b"config", config.mint.as_ref()],
        bump = config.bump,
    )]
    pub config: Account<'info, StablecoinConfig>,

    /// The role manager.
    #[account(
        seeds = [b"roles", config.key().as_ref()],
        bump = role_manager.bump,
        has_one = config,
    )]
    pub role_manager: Account<'info, RoleManager>,

    /// The blacklist entry PDA to create.
    #[account(
        init,
        payer = blacklister,
        space = BlacklistEntry::space(),
        seeds = [b"blacklist", config.key().as_ref(), address_to_blacklist.key().as_ref()],
        bump,
    )]
    pub blacklist_entry: Account<'info, BlacklistEntry>,

    /// The address being blacklisted.
    /// CHECK: Can be any address.
    pub address_to_blacklist: AccountInfo<'info>,

    pub system_program: Program<'info, System>,
}

/// Accounts for the remove_from_blacklist instruction.
#[derive(Accounts)]
pub struct RemoveFromBlacklist<'info> {
    /// The blacklister signing the transaction.
    #[account(mut)]
    pub blacklister: Signer<'info>,

    /// The stablecoin configuration.
    #[account(
        seeds = [b"config", config.mint.as_ref()],
        bump = config.bump,
    )]
    pub config: Account<'info, StablecoinConfig>,

    /// The role manager.
    #[account(
        seeds = [b"roles", config.key().as_ref()],
        bump = role_manager.bump,
        has_one = config,
    )]
    pub role_manager: Account<'info, RoleManager>,

    /// The blacklist entry PDA to close.
    #[account(
        mut,
        seeds = [b"blacklist", config.key().as_ref(), blacklist_entry.address.as_ref()],
        bump = blacklist_entry.bump,
        close = blacklister,
    )]
    pub blacklist_entry: Account<'info, BlacklistEntry>,
}

/// Event emitted when an address is added to the blacklist.
#[event]
pub struct AddressBlacklisted {
    pub config: Pubkey,
    pub address: Pubkey,
    pub reason: String,
    pub blacklisted_by: Pubkey,
}

/// Event emitted when an address is removed from the blacklist.
#[event]
pub struct AddressUnblacklisted {
    pub config: Pubkey,
    pub address: Pubkey,
    pub removed_by: Pubkey,
}

pub fn add_handler(ctx: Context<AddToBlacklist>, reason: String) -> Result<()> {
    let config = &ctx.accounts.config;
    let role_manager = &ctx.accounts.role_manager;
    let blacklister_key = ctx.accounts.blacklister.key();

    // Feature gate: compliance must be enabled
    require!(
        config.is_compliance_enabled(),
        SssError::ComplianceNotEnabled
    );

    // Check authorization
    require!(
        blacklister_key == role_manager.blacklister
            || blacklister_key == role_manager.master_authority,
        SssError::UnauthorizedBlacklister
    );

    // Validate reason length
    require!(reason.len() <= MAX_REASON_LEN, SssError::ReasonTooLong);

    // Populate blacklist entry
    let blacklist_entry = &mut ctx.accounts.blacklist_entry;
    blacklist_entry.config = config.key();
    blacklist_entry.address = ctx.accounts.address_to_blacklist.key();
    blacklist_entry.reason = reason.clone();
    blacklist_entry.blacklisted_at = Clock::get()?.unix_timestamp;
    blacklist_entry.blacklisted_by = blacklister_key;
    blacklist_entry.bump = ctx.bumps.blacklist_entry;

    emit!(AddressBlacklisted {
        config: config.key(),
        address: ctx.accounts.address_to_blacklist.key(),
        reason,
        blacklisted_by: blacklister_key,
    });

    Ok(())
}

pub fn remove_handler(ctx: Context<RemoveFromBlacklist>) -> Result<()> {
    let config = &ctx.accounts.config;
    let role_manager = &ctx.accounts.role_manager;
    let blacklister_key = ctx.accounts.blacklister.key();

    // Feature gate: compliance must be enabled
    require!(
        config.is_compliance_enabled(),
        SssError::ComplianceNotEnabled
    );

    // Check authorization
    require!(
        blacklister_key == role_manager.blacklister
            || blacklister_key == role_manager.master_authority,
        SssError::UnauthorizedBlacklister
    );

    let address = ctx.accounts.blacklist_entry.address;

    emit!(AddressUnblacklisted {
        config: config.key(),
        address,
        removed_by: blacklister_key,
    });

    // Account is closed via the `close = blacklister` constraint

    Ok(())
}
