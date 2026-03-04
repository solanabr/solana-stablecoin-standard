use anchor_lang::prelude::*;
use anchor_spl::token_interface::{Mint, TokenAccount, TokenInterface};
use crate::{error::HookError, state::BlacklistEntry};

/// Accounts passed to the transfer hook by Token-2022.
///
/// The first 5 accounts are the standard SPL transfer hook interface accounts.
/// Accounts 6 and 7 are the extra accounts resolved from ExtraAccountMetaList.
#[derive(Accounts)]
pub struct TransferHook<'info> {
    /// Source token account (standard hook account 0)
    ///
    /// We only validate the mint; we do NOT check `token::authority = owner`
    /// because seize operations use the config PDA as permanent delegate, which
    /// means the transfer authority is NOT the source account owner.
    #[account(token::mint = mint)]
    pub source_token: InterfaceAccount<'info, TokenAccount>,

    /// The mint with transfer hook enabled (standard hook account 1)
    pub mint: InterfaceAccount<'info, Mint>,

    /// Destination token account (standard hook account 2)
    #[account(token::mint = mint)]
    pub destination_token: InterfaceAccount<'info, TokenAccount>,

    /// CHECK: Source token account owner/authority (standard hook account 3).
    /// Not necessarily a signer — Token-2022 calls the hook via CPI and passes
    /// the original transfer's owner as a non-signer read-only account.
    pub owner: UncheckedAccount<'info>,

    /// CHECK: ExtraAccountMetaList PDA (standard hook account 4).
    /// Required by the SPL transfer hook interface.
    #[account(
        seeds = [b"extra-account-metas", mint.key().as_ref()],
        bump,
    )]
    pub extra_account_meta_list: UncheckedAccount<'info>,

    /// CHECK: The sss-token program (extra account 0, account index 5).
    /// Passed by Token-2022 as the first extra account from the ExtraAccountMetaList.
    /// Required because the two BlacklistEntry PDAs are derived by this external program.
    pub sss_token_program: UncheckedAccount<'info>,

    /// CHECK: Source owner's BlacklistEntry PDA from the sss-token program (extra account 1).
    /// seeds: ["blacklist", mint, source_owner]
    /// May not exist if the source owner is not blacklisted — we check data_len() > 0.
    pub source_blacklist_entry: UncheckedAccount<'info>,

    /// CHECK: Destination owner's BlacklistEntry PDA from the sss-token program (extra account 2).
    /// seeds: ["blacklist", mint, destination_owner]
    /// May not exist if the destination owner is not blacklisted — we check data_len() > 0.
    pub destination_blacklist_entry: UncheckedAccount<'info>,
}

pub fn handler(ctx: Context<TransferHook>, _amount: u64) -> Result<()> {
    // Check source owner blacklist entry.
    // If the PDA exists (data_len > 0) and active == true, reject the transfer.
    let source_entry_info = &ctx.accounts.source_blacklist_entry;
    if source_entry_info.data_len() > 0 {
        let source_entry = BlacklistEntry::try_deserialize(
            &mut source_entry_info.data.borrow().as_ref(),
        )
        .map_err(|_| HookError::InvalidExtraAccountMetaList)?;

        require!(!source_entry.active, HookError::SourceBlacklisted);
    }

    // Check destination owner blacklist entry.
    let dest_entry_info = &ctx.accounts.destination_blacklist_entry;
    if dest_entry_info.data_len() > 0 {
        let dest_entry = BlacklistEntry::try_deserialize(
            &mut dest_entry_info.data.borrow().as_ref(),
        )
        .map_err(|_| HookError::InvalidExtraAccountMetaList)?;

        require!(!dest_entry.active, HookError::DestinationBlacklisted);
    }

    msg!("Transfer hook passed: neither party is blacklisted");
    Ok(())
}
