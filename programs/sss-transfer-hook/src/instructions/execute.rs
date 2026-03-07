use anchor_lang::prelude::*;
use anchor_spl::token_interface::{Mint, TokenAccount};
use crate::{constants::*, error::SssHookError};

/// Execute hook — called by Token-2022 on every transfer.
/// The spl_transfer_hook_interface discriminator for this instruction is
/// `[105, 37, 101, 197, 75, 251, 102, 26]`.
///
/// Accounts (fixed by Token-2022 protocol):
///   0: source_token_account
///   1: mint
///   2: destination_token_account
///   3: owner (source token account authority)
///   4: extra_account_meta_list
/// Extra accounts (indices 5+, registered in initialize_extra_account_meta_list):
///   5: source_blacklist_entry (may or may not exist)
///   6: destination_blacklist_entry (may or may not exist)
#[derive(Accounts)]
pub struct Execute<'info> {
    /// Source token account
    pub source_token_account: InterfaceAccount<'info, TokenAccount>,

    /// The mint
    pub mint: InterfaceAccount<'info, Mint>,

    /// Destination token account
    pub destination_token_account: InterfaceAccount<'info, TokenAccount>,

    /// Source token account owner
    /// CHECK: we only use this for PDA derivation
    pub owner: UncheckedAccount<'info>,

    /// ExtraAccountMetaList PDA
    /// CHECK: validated by seeds
    #[account(
        seeds = [EXTRA_ACCOUNT_METAS_SEED, mint.key().as_ref()],
        bump,
    )]
    pub extra_account_meta_list: UncheckedAccount<'info>,

    /// Blacklist entry for the source owner — CHECK: may not exist (that's ok)
    /// seeds: [BLACKLIST_SEED, mint, source_owner]
    /// CHECK: we only check if this account has data (exists = blacklisted)
    #[account(
        seeds = [
            BLACKLIST_SEED,
            mint.key().as_ref(),
            owner.key().as_ref(),
        ],
        bump,
    )]
    pub source_blacklist_entry: UncheckedAccount<'info>,

    /// Blacklist entry for the destination token account — CHECK: may not exist
    /// seeds: [BLACKLIST_SEED, mint, destination_token_account]
    /// CHECK: we only check if this account has data
    #[account(
        seeds = [
            BLACKLIST_SEED,
            mint.key().as_ref(),
            destination_token_account.key().as_ref(),
        ],
        bump,
    )]
    pub destination_blacklist_entry: UncheckedAccount<'info>,

}

/// The transfer hook execute handler.
/// We check both blacklist PDAs for account existence.
/// If an account exists at the expected PDA address, the party is blacklisted.
pub fn handler(ctx: Context<Execute>, _amount: u64) -> Result<()> {
    // Source owner blacklisted?
    require!(
        ctx.accounts.source_blacklist_entry.data_is_empty(),
        SssHookError::SenderBlacklisted
    );

    // Destination blacklisted?
    require!(
        ctx.accounts.destination_blacklist_entry.data_is_empty(),
        SssHookError::RecipientBlacklisted
    );

    Ok(())
}
