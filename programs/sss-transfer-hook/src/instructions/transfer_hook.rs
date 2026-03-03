use anchor_lang::prelude::*;
use crate::state::HookConfig;
use crate::error::HookError;

#[derive(Accounts)]
pub struct TransferHook<'info> {
    /// CHECK: Source token account
    pub source: UncheckedAccount<'info>,

    /// CHECK: Mint
    pub mint: UncheckedAccount<'info>,

    /// CHECK: Destination token account
    pub destination: UncheckedAccount<'info>,

    /// CHECK: Owner/delegate of source
    pub owner: UncheckedAccount<'info>,

    /// CHECK: ExtraAccountMetaList PDA
    #[account(
        seeds = [b"extra-account-metas", mint.key().as_ref()],
        bump,
    )]
    pub extra_account_meta_list: UncheckedAccount<'info>,

    /// Hook config
    #[account(
        seeds = [b"hook_config", mint.key().as_ref()],
        bump = hook_config.bump,
    )]
    pub hook_config: Account<'info, HookConfig>,

    /// CHECK: Sender blacklist PDA (may not exist)
    pub sender_blacklist: UncheckedAccount<'info>,

    /// CHECK: Receiver blacklist PDA (may not exist)
    pub receiver_blacklist: UncheckedAccount<'info>,
}

pub fn handler(ctx: Context<TransferHook>, _amount: u64) -> Result<()> {
    let hook_config_key = ctx.accounts.hook_config.key();

    // Validate sender blacklist PDA derivation — fail hard if data is too short
    let source_data = ctx.accounts.source.try_borrow_data()?;
    require!(source_data.len() >= 64, HookError::Unauthorized);
    let sender_owner = Pubkey::try_from(&source_data[32..64])
        .map_err(|_| HookError::Unauthorized)?;
    drop(source_data);
    let (expected_sender_bl, _) = Pubkey::find_program_address(
        &[b"blacklist", hook_config_key.as_ref(), sender_owner.as_ref()],
        &crate::id(),
    );
    require_keys_eq!(
        ctx.accounts.sender_blacklist.key(),
        expected_sender_bl,
        HookError::Unauthorized
    );

    // Validate receiver blacklist PDA derivation — fail hard if data is too short
    let dest_data = ctx.accounts.destination.try_borrow_data()?;
    require!(dest_data.len() >= 64, HookError::Unauthorized);
    let receiver_owner = Pubkey::try_from(&dest_data[32..64])
        .map_err(|_| HookError::Unauthorized)?;
    drop(dest_data);
    let (expected_receiver_bl, _) = Pubkey::find_program_address(
        &[b"blacklist", hook_config_key.as_ref(), receiver_owner.as_ref()],
        &crate::id(),
    );
    require_keys_eq!(
        ctx.accounts.receiver_blacklist.key(),
        expected_receiver_bl,
        HookError::Unauthorized
    );

    // If sender blacklist PDA exists (has lamports > 0), sender is blacklisted
    let sender_bl = &ctx.accounts.sender_blacklist;
    if sender_bl.lamports() > 0 && sender_bl.data_len() > 0 {
        return Err(HookError::SenderBlacklisted.into());
    }

    // If receiver blacklist PDA exists (has lamports > 0), receiver is blacklisted
    let receiver_bl = &ctx.accounts.receiver_blacklist;
    if receiver_bl.lamports() > 0 && receiver_bl.data_len() > 0 {
        return Err(HookError::ReceiverBlacklisted.into());
    }

    Ok(())
}
