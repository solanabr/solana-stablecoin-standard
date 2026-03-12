use anchor_lang::prelude::*;

declare_id!("HmbTLCmaGtYhSJaoxkmcJA2MkRYEbn7gxjoYDMgbGnHb");

/// Transfer Hook Program for SSS-2 Compliant Stablecoins
///
/// This program implements the SPL Transfer Hook interface.
/// On every token transfer, it verifies that neither the sender
/// nor the recipient is on the blacklist. If either party is
/// blacklisted, the transfer is rejected.
///
/// The ExtraAccountMeta list includes the blacklist PDAs for
/// both the source and destination addresses, resolved via
/// the `spl-tlv-account-resolution` crate.
#[program]
pub mod transfer_hook {
    use super::*;

    /// Initialize the ExtraAccountMetaList for the transfer hook.
    /// This sets up which additional accounts must be provided
    /// on every transfer (the blacklist PDAs for sender and recipient).
    pub fn initialize_extra_account_meta_list(
        _ctx: Context<InitializeExtraAccountMetaList>,
    ) -> Result<()> {
        // TODO: Phase 3 — Implementation
        // 1. Create the ExtraAccountMetaList account
        // 2. Define ExtraAccountMeta entries for:
        //    - SSS Token program ID (for blacklist PDA derivation)
        //    - Sender blacklist PDA
        //    - Recipient blacklist PDA
        // 3. Use spl_tlv_account_resolution for dynamic PDA resolution
        Ok(())
    }

    /// Transfer hook execute — called on every token transfer.
    /// Checks both sender and recipient against the blacklist.
    pub fn transfer_hook(
        _ctx: Context<TransferHookCtx>,
        _amount: u64,
    ) -> Result<()> {
        // TODO: Phase 3 — Implementation
        // 1. Derive blacklist PDA for source owner
        // 2. Derive blacklist PDA for destination owner
        // 3. If either PDA account exists (has data), reject the transfer
        // 4. If neither is blacklisted, allow the transfer (return Ok)
        Ok(())
    }

    /// Fallback instruction handler for the transfer hook interface.
    /// Required by the SPL transfer hook interface specification.
    pub fn fallback<'info>(
        _program_id: &Pubkey,
        _accounts: &'info [AccountInfo<'info>],
        _data: &[u8],
    ) -> Result<()> {
        Ok(())
    }
}

#[derive(Accounts)]
pub struct InitializeExtraAccountMetaList<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    /// CHECK: Validated in handler — the ExtraAccountMetaList PDA
    #[account(mut)]
    pub extra_account_meta_list: AccountInfo<'info>,

    /// CHECK: The Token-2022 mint this hook is associated with
    pub mint: AccountInfo<'info>,

    /// CHECK: The SSS Token program (for blacklist PDA derivation)
    pub sss_token_program: AccountInfo<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct TransferHookCtx<'info> {
    /// CHECK: Source token account
    pub source_token: AccountInfo<'info>,

    /// CHECK: Mint
    pub mint: AccountInfo<'info>,

    /// CHECK: Destination token account
    pub destination_token: AccountInfo<'info>,

    /// CHECK: Source token account owner
    pub owner: AccountInfo<'info>,

    /// CHECK: ExtraAccountMetaList PDA
    pub extra_account_meta_list: AccountInfo<'info>,

    // Additional accounts will be added in Phase 3:
    // - sss_token_program
    // - source_blacklist_entry (optional, may not exist)
    // - destination_blacklist_entry (optional, may not exist)
}
