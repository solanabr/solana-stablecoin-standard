use anchor_lang::prelude::*;
use crate::state::HookConfig;
use crate::error::HookError;

#[derive(Accounts)]
pub struct TransferHook<'info> {
    /// CHECK: Source token account (resolved by Token-2022)
    pub source: UncheckedAccount<'info>,

    /// CHECK: Mint (resolved by Token-2022)
    pub mint: UncheckedAccount<'info>,

    /// CHECK: Destination token account (resolved by Token-2022)
    pub destination: UncheckedAccount<'info>,

    /// CHECK: Owner/delegate of source (resolved by Token-2022)
    pub owner: UncheckedAccount<'info>,

    /// CHECK: ExtraAccountMetaList PDA — resolved by Token-2022 on-chain via
    /// spl_transfer_hook_interface. The runtime resolves this account and the
    /// extra metas below using the seeds defined in initialize_extra_account_meta_list.
    #[account(
        seeds = [b"extra-account-metas", mint.key().as_ref()],
        bump,
    )]
    pub extra_account_meta_list: UncheckedAccount<'info>,

    /// Hook config — resolved via ExtraAccountMetaList (Meta 0).
    /// Seeds: ["hook_config", mint]
    #[account(
        seeds = [b"hook_config", mint.key().as_ref()],
        bump = hook_config.bump,
    )]
    pub hook_config: Account<'info, HookConfig>,

    /// CHECK: Sender blacklist PDA — resolved via ExtraAccountMetaList (Meta 1).
    /// Seeds: ["blacklist", hook_config, source_owner] derived from source token
    /// account data at offset 32. Account may not exist (lamports == 0 means
    /// the sender is not blacklisted).
    pub sender_blacklist: UncheckedAccount<'info>,

    /// CHECK: Receiver blacklist PDA — resolved via ExtraAccountMetaList (Meta 2).
    /// Seeds: ["blacklist", hook_config, dest_owner] derived from destination
    /// token account data at offset 32. Account may not exist.
    pub receiver_blacklist: UncheckedAccount<'info>,
}

pub fn handler(ctx: Context<TransferHook>, _amount: u64) -> Result<()> {
    // ExtraAccountMetaList resolution (performed by Token-2022 before CPI)
    // already guarantees that sender_blacklist and receiver_blacklist are the
    // correct PDAs derived from the source/destination token account owners.
    // No manual re-derivation needed here.

    // If sender blacklist PDA exists (has data), sender is blacklisted
    let sender_bl = &ctx.accounts.sender_blacklist;
    if sender_bl.lamports() > 0 && sender_bl.data_len() > 0 {
        return Err(HookError::SenderBlacklisted.into());
    }

    // If receiver blacklist PDA exists (has data), receiver is blacklisted
    let receiver_bl = &ctx.accounts.receiver_blacklist;
    if receiver_bl.lamports() > 0 && receiver_bl.data_len() > 0 {
        return Err(HookError::ReceiverBlacklisted.into());
    }

    Ok(())
}
