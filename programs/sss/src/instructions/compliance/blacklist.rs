use anchor_lang::prelude::*;
use crate::state::*;
use crate::errors::*;
use crate::events::*;

#[derive(Accounts)]
#[instruction(account_to_blacklist: Pubkey)]
pub struct ToggleBlacklist<'info> {
    #[account(mut)]
    pub blacklister: Signer<'info>,

    #[account(
        constraint = config.enable_transfer_hook == true @ StablecoinError::ComplianceModuleDisabled
    )]
    pub config: Account<'info, StablecoinConfig>,

    #[account(
        seeds = [b"role", config.key().as_ref(), blacklister.key().as_ref()],
        bump,
        constraint = role_registry.has_blacklister @ StablecoinError::Unauthorized
    )]
    pub role_registry: Account<'info, RoleRegistry>,

    #[account(
        init_if_needed,
        payer = blacklister,
        space = BlacklistRegistry::LEN,
        seeds = [b"blacklist", config.key().as_ref(), account_to_blacklist.as_ref()],
        bump
    )]
    pub blacklist_record: Account<'info, BlacklistRegistry>,

    pub system_program: Program<'info, System>,
}

pub fn add_to_blacklist(ctx: Context<ToggleBlacklist>, account_to_blacklist: Pubkey, reason: String) -> Result<()> {
    let record = &mut ctx.accounts.blacklist_record;
    record.config = ctx.accounts.config.key();
    record.account = account_to_blacklist;
    record.reason = reason.clone();
    record.bump = ctx.bumps.blacklist_record;

    emit!(BlacklistAddEvent {
        config: ctx.accounts.config.key(),
        account: account_to_blacklist,
        reason,
        by: ctx.accounts.blacklister.key(),
    });

    Ok(())
}

#[derive(Accounts)]
#[instruction(account_to_remove: Pubkey)]
pub struct RemoveBlacklist<'info> {
    #[account(mut)]
    pub blacklister: Signer<'info>,

    #[account(
        constraint = config.enable_transfer_hook == true @ StablecoinError::ComplianceModuleDisabled
    )]
    pub config: Account<'info, StablecoinConfig>,

    #[account(
        seeds = [b"role", config.key().as_ref(), blacklister.key().as_ref()],
        bump,
        constraint = role_registry.has_blacklister @ StablecoinError::Unauthorized
    )]
    pub role_registry: Account<'info, RoleRegistry>,

    #[account(
        mut,
        close = blacklister,
        seeds = [b"blacklist", config.key().as_ref(), account_to_remove.as_ref()],
        bump = blacklist_record.bump
    )]
    pub blacklist_record: Account<'info, BlacklistRegistry>,
}

pub fn remove_from_blacklist(ctx: Context<RemoveBlacklist>, account_to_remove: Pubkey) -> Result<()> {
    emit!(BlacklistRemoveEvent {
        config: ctx.accounts.config.key(),
        account: account_to_remove,
        by: ctx.accounts.blacklister.key(),
    });

    Ok(())
}
