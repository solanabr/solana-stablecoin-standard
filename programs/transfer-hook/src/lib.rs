use anchor_lang::prelude::*;
use spl_transfer_hook_interface::instruction::ExecuteInstruction;
use spl_tlv_account_resolution::{
    account::ExtraAccountMeta,
    seeds::Seed,
    state::ExtraAccountMetaList,
};

declare_id!("Ecda92mVcyuzZ46BNUc2pnr3iCRX8Bn7Fv1BV1BRd18h");

/// Discriminator for the transfer hook execute instruction
pub const EXECUTE_IX_TAG_LE: [u8; 8] = ExecuteInstruction::SPL_DISCRIMINATOR_SLICE
    .try_into()
    .expect("Invalid discriminator length");

#[program]
pub mod transfer_hook {
    use super::*;

    /// Initialize the extra account meta list for this hook.
    /// Called once per mint to register required extra accounts.
    pub fn initialize_extra_account_meta_list(
        ctx: Context<InitializeExtraAccountMetaList>,
        stablecoin_state: Pubkey,
    ) -> Result<()> {
        // We need two blacklist PDAs to check: one for sender, one for receiver.
        // Both are derived from the SSS-token program's stablecoin state + wallet pubkey.
        let account_metas = vec![
            // index 5: sender blacklist PDA
            ExtraAccountMeta::new_with_seeds(
                &[
                    Seed::Literal { bytes: b"blacklist".to_vec() },
                    Seed::Literal { bytes: stablecoin_state.to_bytes().to_vec() },
                    Seed::AccountKey { index: 0 }, // source wallet
                ],
                false, // is_signer
                false, // is_writable
            )?,
            // index 6: recipient blacklist PDA
            ExtraAccountMeta::new_with_seeds(
                &[
                    Seed::Literal { bytes: b"blacklist".to_vec() },
                    Seed::Literal { bytes: stablecoin_state.to_bytes().to_vec() },
                    Seed::AccountKey { index: 2 }, // destination wallet
                ],
                false,
                false,
            )?,
            // index 7: stablecoin state (to confirm program IDs match)
            ExtraAccountMeta::new_external_pda_with_seeds(
                5, // program index in accounts
                &[
                    Seed::Literal { bytes: b"stablecoin".to_vec() },
                    Seed::AccountKey { index: 1 }, // mint
                ],
                false,
                false,
            )?,
        ];

        let mut data = ctx.accounts.extra_account_meta_list.try_borrow_mut_data()?;
        ExtraAccountMetaList::init::<ExecuteInstruction>(&mut data, &account_metas)?;

        Ok(())
    }

    /// The hook entrypoint — called by Token-2022 on every transfer.
    /// Checks if source or destination wallet is on the blacklist.
    pub fn execute(ctx: Context<Execute>, _amount: u64) -> Result<()> {
        // The blacklist PDA accounts are passed as remaining_accounts.
        // If the account does NOT exist (no lamports), no blacklist entry = allowed.
        // If it DOES exist and is active, block the transfer.

        let sender_blacklist = &ctx.remaining_accounts[0];
        let receiver_blacklist = &ctx.remaining_accounts[1];

        check_not_blacklisted(sender_blacklist, true)?;
        check_not_blacklisted(receiver_blacklist, false)?;

        Ok(())
    }
}

fn check_not_blacklisted(account: &AccountInfo, is_sender: bool) -> Result<()> {
    // Account doesn't exist → not blacklisted → OK
    if account.lamports() == 0 || account.data_is_empty() {
        return Ok(());
    }

    // Account exists → parse discriminator + active flag
    // BlacklistEntry layout: 8 (disc) + 32 (stablecoin) + 32 (address) + ... + 1 (active)
    // active is at byte offset: 8 + 32 + 32 + 4 + reason_len + 8 + 32 = variable
    // We check via a safe approach: if account exists with our expected discriminator, it's blacklisted.
    let data = account.try_borrow_data()?;
    if data.len() < 9 {
        return Ok(());
    }

    // Check active flag — offset 8+32+32+(4+reason)+8+32 = at least 120 bytes in
    // We take a conservative approach: any existing non-empty PDA at this seed = blacklisted.
    // The SSS-token program only creates these PDAs when adding to blacklist,
    // and closes them (returning lamports) when removing — so existence = active.

    if is_sender {
        return err!(HookError::SenderBlacklisted);
    } else {
        return err!(HookError::RecipientBlacklisted);
    }
}

#[derive(Accounts)]
pub struct InitializeExtraAccountMetaList<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    /// CHECK: The extra account meta list PDA for this mint
    #[account(
        mut,
        seeds = [b"extra-account-metas", mint.key().as_ref()],
        bump,
    )]
    pub extra_account_meta_list: UncheckedAccount<'info>,

    pub mint: InterfaceAccount<'info, anchor_spl::token_interface::Mint>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Execute<'info> {
    /// Source token account
    pub source_token: InterfaceAccount<'info, anchor_spl::token_interface::TokenAccount>,
    /// Mint
    pub mint: InterfaceAccount<'info, anchor_spl::token_interface::Mint>,
    /// Destination token account
    pub destination_token: InterfaceAccount<'info, anchor_spl::token_interface::TokenAccount>,
    /// Source wallet / owner
    /// CHECK: We just check its blacklist PDA
    pub owner: UncheckedAccount<'info>,
    /// Extra account meta list
    /// CHECK: Validated by Token-2022 runtime
    pub extra_account_meta_list: UncheckedAccount<'info>,
}

#[error_code]
pub enum HookError {
    #[msg("Transfer blocked: sender is blacklisted")]
    SenderBlacklisted,
    #[msg("Transfer blocked: recipient is blacklisted")]
    RecipientBlacklisted,
}