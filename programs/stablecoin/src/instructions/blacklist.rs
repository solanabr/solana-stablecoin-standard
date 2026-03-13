use anchor_lang::prelude::*;

use crate::instructions::auth::require_operator_role;
use crate::errors::StablecoinError;
use crate::events::BlacklistUpdated;
use crate::state::{BlacklistEntry, RoleAssignment, RoleType, StablecoinConfig};

#[derive(Accounts)]
#[instruction(address: Pubkey, reason: String)]
pub struct AddToBlacklist<'info> {
    #[account(mut)]
    pub config: Account<'info, StablecoinConfig>,
    #[account(mut)]
    pub operator: Signer<'info>,
    /// CHECK: Mint account key is used for PDA derivation and config matching in this scaffold.
    pub mint: UncheckedAccount<'info>,
    #[account(
        init,
        payer = operator,
        space = BlacklistEntry::LEN,
        seeds = [b"blacklist", mint.key().as_ref(), address.as_ref()],
        bump
    )]
    pub blacklist_entry: Account<'info, BlacklistEntry>,
    pub system_program: Program<'info, System>,
    pub role_assignment: Option<Account<'info, RoleAssignment>>,
}

#[derive(Accounts)]
pub struct RemoveFromBlacklist<'info> {
    pub config: Account<'info, StablecoinConfig>,
    pub operator: Signer<'info>,
    /// CHECK: Mint account key is used for PDA derivation and config matching in this scaffold.
    pub mint: UncheckedAccount<'info>,
    #[account(
        mut,
        seeds = [b"blacklist", mint.key().as_ref(), blacklist_entry.address.as_ref()],
        bump = blacklist_entry.bump,
        close = operator
    )]
    pub blacklist_entry: Account<'info, BlacklistEntry>,
    pub role_assignment: Option<Account<'info, RoleAssignment>>,
}

pub fn add_handler(ctx: Context<AddToBlacklist>, address: Pubkey, reason: String) -> Result<()> {
    require_operator_role(
        ctx.program_id,
        &ctx.accounts.config,
        &ctx.accounts.operator.key(),
        ctx.accounts.role_assignment.as_ref(),
        RoleType::Blacklister,
    )?;
    require_keys_eq!(
        ctx.accounts.config.mint,
        ctx.accounts.mint.key(),
        StablecoinError::InvalidMint
    );
    require!(
        ctx.accounts.config.enable_transfer_hook,
        StablecoinError::ComplianceNotEnabled
    );
    require!(
        reason.len() <= BlacklistEntry::MAX_REASON_LEN,
        StablecoinError::ReasonTooLong
    );

    let entry = &mut ctx.accounts.blacklist_entry;
    entry.mint = ctx.accounts.mint.key();
    entry.address = address;
    entry.reason = reason;
    entry.added_by = ctx.accounts.operator.key();
    entry.added_at = Clock::get()?.unix_timestamp;
    entry.bump = ctx.bumps.blacklist_entry;

    emit!(BlacklistUpdated {
        mint: ctx.accounts.mint.key(),
        address,
        added: true,
        authority: ctx.accounts.operator.key(),
        reason: entry.reason.clone(),
    });

    Ok(())
}

pub fn remove_handler(ctx: Context<RemoveFromBlacklist>) -> Result<()> {
    require_operator_role(
        ctx.program_id,
        &ctx.accounts.config,
        &ctx.accounts.operator.key(),
        ctx.accounts.role_assignment.as_ref(),
        RoleType::Blacklister,
    )?;
    require!(
        ctx.accounts.config.enable_transfer_hook,
        StablecoinError::ComplianceNotEnabled
    );
    require_keys_eq!(
        ctx.accounts.config.mint,
        ctx.accounts.mint.key(),
        StablecoinError::InvalidMint
    );
    require_keys_eq!(
        ctx.accounts.blacklist_entry.mint,
        ctx.accounts.mint.key(),
        StablecoinError::InvalidMint
    );
    emit!(BlacklistUpdated {
        mint: ctx.accounts.mint.key(),
        address: ctx.accounts.blacklist_entry.address,
        added: false,
        authority: ctx.accounts.operator.key(),
        reason: ctx.accounts.blacklist_entry.reason.clone(),
    });
    Ok(())
}
