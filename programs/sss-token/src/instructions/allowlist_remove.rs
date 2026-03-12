use anchor_lang::prelude::*;

use crate::errors::SssError;
use crate::events::AllowlistRemoved;
use crate::state::*;
use crate::utils::require_role;

#[derive(Accounts)]
pub struct AllowlistRemove<'info> {
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

    /// CHECK: The address being removed from the allowlist.
    pub address_to_remove: UncheckedAccount<'info>,

    /// CHECK: PDA address is validated by seeds/bump. Data is validated and closed manually
    /// in the handler so missing accounts can return AllowlistEntryNotFound.
    #[account(
        mut,
        seeds = [AllowlistEntry::SEED_PREFIX, config.key().as_ref(), address_to_remove.key().as_ref()],
        bump,
    )]
    pub allowlist_entry: UncheckedAccount<'info>,
}

pub fn handler(ctx: Context<AllowlistRemove>) -> Result<()> {
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

    let allowlist_entry_info = ctx.accounts.allowlist_entry.to_account_info();
    require!(
        allowlist_entry_info.owner == &crate::ID && !allowlist_entry_info.data_is_empty(),
        SssError::AllowlistEntryNotFound
    );

    let clock = Clock::get()?;
    let allowlist_entry = {
        let data = allowlist_entry_info.try_borrow_data()?;
        let mut data_slice: &[u8] = &data;
        AllowlistEntry::try_deserialize(&mut data_slice)?
    };
    require!(
        allowlist_entry.config == config.key(),
        SssError::InvalidAuthority
    );
    let address = allowlist_entry.address;
    let lamports = allowlist_entry_info.lamports();
    **ctx
        .accounts
        .authority
        .to_account_info()
        .try_borrow_mut_lamports()? = ctx
        .accounts
        .authority
        .to_account_info()
        .lamports()
        .checked_add(lamports)
        .ok_or(SssError::Overflow)?;
    **allowlist_entry_info.try_borrow_mut_lamports()? = 0;
    allowlist_entry_info.assign(&anchor_lang::solana_program::system_program::ID);
    allowlist_entry_info.realloc(0, false)?;

    emit!(AllowlistRemoved {
        config: config.key(),
        address,
        removed_by: ctx.accounts.authority.key(),
        timestamp: clock.unix_timestamp,
    });

    let config = &mut ctx.accounts.config;
    config.updated_at = clock.unix_timestamp;

    Ok(())
}
