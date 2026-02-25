use anchor_lang::prelude::*;
use anchor_spl::token_interface::{Mint, TokenAccount};

use crate::error::HookError;

pub const EXTRA_ACCOUNT_METAS_SEED: &[u8] = b"extra-account-metas";
pub const BLACKLIST_SEED: &[u8] = b"blacklist";

#[derive(Accounts)]
pub struct Execute<'info> {
    #[account(token::mint = mint)]
    pub source_token_account: InterfaceAccount<'info, TokenAccount>,

    pub mint: InterfaceAccount<'info, Mint>,

    #[account(token::mint = mint)]
    pub destination_token_account: InterfaceAccount<'info, TokenAccount>,

    /// CHECK: Token-2022 validates this is the actual transfer authority
    pub source_authority: UncheckedAccount<'info>,

    /// CHECK: Validated by seeds
    #[account(
        seeds = [EXTRA_ACCOUNT_METAS_SEED, mint.key().as_ref()],
        bump,
    )]
    pub extra_account_meta_list: UncheckedAccount<'info>,
    // remaining_accounts resolved by Token-2022 from ExtraAccountMetaList:
    //   [0] sss-token program
    //   [1] sender blacklist PDA
    //   [2] recipient blacklist PDA
}

pub fn handler(ctx: Context<Execute>, _amount: u64) -> Result<()> {
    let remaining = ctx.remaining_accounts;
    require!(remaining.len() >= 3, ErrorCode::AccountNotEnoughKeys);

    let mint_key = ctx.accounts.mint.key();
    let sender_key = ctx.accounts.source_authority.key();
    let dest_owner = ctx.accounts.destination_token_account.owner;
    let sss_token_id = crate::sss_token_program::ID;

    let sender_blacklist = &remaining[1];
    let recipient_blacklist = &remaining[2];

    let (expected_sender_pda, _) = Pubkey::find_program_address(
        &[BLACKLIST_SEED, mint_key.as_ref(), sender_key.as_ref()],
        &sss_token_id,
    );
    require_keys_eq!(
        sender_blacklist.key(),
        expected_sender_pda,
        HookError::InvalidBlacklistAccount
    );

    let (expected_recipient_pda, _) = Pubkey::find_program_address(
        &[BLACKLIST_SEED, mint_key.as_ref(), dest_owner.as_ref()],
        &sss_token_id,
    );
    require_keys_eq!(
        recipient_blacklist.key(),
        expected_recipient_pda,
        HookError::InvalidBlacklistAccount
    );

    if sender_blacklist.lamports() > 0 {
        return err!(HookError::SenderBlacklisted);
    }

    if recipient_blacklist.lamports() > 0 {
        return err!(HookError::RecipientBlacklisted);
    }

    Ok(())
}
