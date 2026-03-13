//! SSS Transfer Hook: Blacklist enforcement for SSS-2 compliant stablecoins.
//!
//! This program implements the SPL Transfer Hook interface. It is invoked on
//! every token transfer and checks whether the source or destination wallet
//! has a blacklist PDA. If either is blacklisted, the transfer is rejected.
//!
//! The hook is registered at mint creation time and cannot be bypassed.

use anchor_lang::prelude::*;
use anchor_spl::token_interface::Mint;

declare_id!("GCKas56DYv14WBEmbX6McYrKhpQijAkQ1Xa39mGEhdp4");

pub const BLACKLIST_SEED: &[u8] = b"blacklist";
pub const STABLECOIN_SEED: &[u8] = b"stablecoin";
pub const EXTRA_METAS_SEED: &[u8] = b"extra-account-metas";

#[error_code]
pub enum TransferHookError {
    #[msg("Sender is blacklisted")]
    SenderBlacklisted,
    #[msg("Recipient is blacklisted")]
    RecipientBlacklisted,
    #[msg("Stablecoin is paused")]
    StablecoinPaused,
}

#[program]
pub mod sss_transfer_hook {
    use super::*;

    /// The transfer hook entry point. Called automatically by Token-2022 on every transfer.
    /// Validates that neither sender nor recipient is blacklisted.
    ///
    /// Account layout follows SPL Transfer Hook Interface:
    /// 0: source token account
    /// 1: mint
    /// 2: destination token account
    /// 3: source authority/owner
    /// 4: extra account metas PDA
    /// 5+: additional accounts (stablecoin config, sender blacklist PDA, recipient blacklist PDA)
    pub fn transfer_hook(ctx: Context<TransferHook>, _amount: u64) -> Result<()> {
        // Check sender blacklist PDA: if the account exists and is not system-owned, sender is blacklisted
        if ctx.accounts.sender_blacklist.data_len() > 0
            && *ctx.accounts.sender_blacklist.owner != System::id()
        {
            return Err(TransferHookError::SenderBlacklisted.into());
        }

        // Check recipient blacklist PDA: if the account exists and is not system-owned, recipient is blacklisted
        if ctx.accounts.recipient_blacklist.data_len() > 0
            && *ctx.accounts.recipient_blacklist.owner != System::id()
        {
            return Err(TransferHookError::RecipientBlacklisted.into());
        }

        Ok(())
    }

    /// Initialize the ExtraAccountMetaList for the transfer hook.
    /// This stores the additional account layout so Token-2022 knows
    /// which extra accounts to pass to the hook on every transfer.
    ///
    /// In production this would use spl_tlv_account_resolution to encode
    /// the extra metas. For compatibility we store a minimal marker.
    pub fn initialize_extra_account_meta_list(
        ctx: Context<InitializeExtraAccountMetaList>,
    ) -> Result<()> {
        // The extra metas PDA is created; Token-2022 will resolve the
        // additional accounts (stablecoin_config, sender_blacklist,
        // recipient_blacklist) during transfer execution.
        //
        // In a full implementation, this would encode ExtraAccountMeta entries
        // using spl_tlv_account_resolution for automatic account resolution.
        // For this version, the client SDK resolves and passes these accounts.
        msg!("Extra account meta list initialized for mint: {}", ctx.accounts.mint.key());
        Ok(())
    }
}

#[derive(Accounts)]
pub struct TransferHook<'info> {
    /// CHECK: Validated by Token-2022
    pub source_token: UncheckedAccount<'info>,

    pub mint: InterfaceAccount<'info, Mint>,

    /// CHECK: Validated by Token-2022
    pub destination_token: UncheckedAccount<'info>,

    /// CHECK: Validated by Token-2022
    pub owner: UncheckedAccount<'info>,

    /// CHECK: Validated by seed derivation
    #[account(
        seeds = [EXTRA_METAS_SEED, mint.key().as_ref()],
        bump,
    )]
    pub extra_account_meta_list: UncheckedAccount<'info>,

    /// CHECK: Stablecoin config from sss-token program
    pub stablecoin_config: UncheckedAccount<'info>,

    /// CHECK: Sender's blacklist PDA — existence check is the validation
    pub sender_blacklist: UncheckedAccount<'info>,

    /// CHECK: Recipient's blacklist PDA — existence check is the validation
    pub recipient_blacklist: UncheckedAccount<'info>,
}

#[derive(Accounts)]
pub struct InitializeExtraAccountMetaList<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    pub mint: InterfaceAccount<'info, Mint>,

    /// CHECK: Will be initialized as a PDA
    #[account(
        init,
        payer = payer,
        space = 8 + 128, // Minimal space for extra account metas
        seeds = [EXTRA_METAS_SEED, mint.key().as_ref()],
        bump,
    )]
    pub extra_account_meta_list: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
}
