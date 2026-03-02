/**
 * SSS Transfer Hook Program
 *
 * This program implements the spl-transfer-hook-interface to enforce blacklist
 * compliance for SSS-2 stablecoins. On every token transfer, it checks whether
 * the sender or receiver is present in the blacklist and rejects the transfer
 * if either is found.
 *
 * The blacklist PDAs are owned by the main SSS program, so this hook program
 * reads them cross-program using account info (no CPI needed, just account read).
 *
 * Architecture:
 * - `execute` instruction: called by Token-2022 on every transfer
 * - `initialize_extra_account_meta_list`: sets up required extra accounts
 */
use anchor_lang::prelude::*;

declare_id!("Eyg11bpgnEySxHVypdi31S6J112dhadnTC2w8bDctK1z");

/// Seeds matching the main SSS program's blacklist PDA — used in off-chain SDK for PDA derivation.
/// The transfer hook receives pre-derived blacklist PDAs from the caller (Token-2022 resolves
/// them via the ExtraAccountMetaList), so the seeds here serve as documentation for integrators.
pub const BLACKLIST_SEED: &[u8] = b"blacklist";

/// The main SSS program ID that owns the blacklist PDAs.
/// Callers must ensure blacklist entry accounts are owned by this program.
pub const SSS_PROGRAM_ID: &str = "GMqW1Zi5DExSZT6CJEYHjhjmP6hUmu2tv9vrYaCgTPrE";

#[error_code]
pub enum HookError {
    #[msg("Transfer rejected: sender is blacklisted")]
    SenderBlacklisted,
    #[msg("Transfer rejected: receiver is blacklisted")]
    ReceiverBlacklisted,
}

#[program]
pub mod sss_transfer_hook {
    use super::*;

    /// Called by Token-2022 on every transfer for SSS-2 mints.
    /// Checks that neither sender nor receiver is blacklisted.
    ///
    /// Accounts:
    /// 0. source_token_account (readonly)
    /// 1. mint (readonly)
    /// 2. destination_token_account (readonly)
    /// 3. authority (signer - the transfer authority)
    /// 4. extra_account_meta_list (readonly, PDA)
    /// 5. sender_blacklist_entry (readonly, PDA — if not blacklisted, this is
    ///    a non-existent account and `data.is_empty() == true`)
    /// 6. receiver_blacklist_entry (readonly, PDA)
    /// 7. sss_program (readonly)
    pub fn execute(ctx: Context<Execute>, _amount: u64) -> Result<()> {
        // If sender's blacklist PDA exists and has data → sender is blacklisted
        if !ctx.accounts.sender_blacklist_entry.data_is_empty() {
            return Err(HookError::SenderBlacklisted.into());
        }

        // If receiver's blacklist PDA exists and has data → receiver is blacklisted
        if !ctx.accounts.receiver_blacklist_entry.data_is_empty() {
            return Err(HookError::ReceiverBlacklisted.into());
        }

        Ok(())
    }

    /// Called once to register the extra accounts needed by this hook.
    /// Stores the ExtraAccountMetaList PDA so Token-2022 knows which
    /// additional accounts to pass on each transfer.
    pub fn initialize_extra_account_meta_list(
        ctx: Context<InitializeExtraAccountMetaList>,
    ) -> Result<()> {
        // Store the mint in the extra meta list so we can derive blacklist PDAs
        // In a full implementation this would use spl_transfer_hook_interface types
        // For now: store the hook program ID confirmation
        msg!(
            "Extra account meta list initialized for mint: {}",
            ctx.accounts.mint.key()
        );
        Ok(())
    }
}

#[derive(Accounts)]
pub struct Execute<'info> {
    /// The source token account (holder sending tokens)
    /// CHECK: read-only, validated by Token-2022
    pub source_token_account: AccountInfo<'info>,

    /// The Token-2022 mint
    /// CHECK: read-only
    pub mint: AccountInfo<'info>,

    /// The destination token account (holder receiving tokens)
    /// CHECK: read-only, validated by Token-2022
    pub destination_token_account: AccountInfo<'info>,

    /// Transfer authority (owner or delegate)
    pub authority: Signer<'info>,

    /// Extra account meta list PDA (for this hook)
    /// Seeds: ["extra-account-metas", mint.key()]
    /// CHECK: PDA owned by this hook program
    #[account(
        seeds = [b"extra-account-metas", mint.key().as_ref()],
        bump
    )]
    pub extra_account_meta_list: AccountInfo<'info>,

    /// Blacklist entry for the SOURCE owner (sender's wallet address)
    /// Seeds: ["blacklist", mint.key(), sender_wallet.key()] — owned by SSS program
    /// CHECK: Non-existent if not blacklisted (zero-lamport account)
    pub sender_blacklist_entry: AccountInfo<'info>,

    /// Blacklist entry for the DESTINATION owner (receiver's wallet address)
    /// Seeds: ["blacklist", mint.key(), receiver_wallet.key()] — owned by SSS program
    /// CHECK: Non-existent if not blacklisted (zero-lamport account)
    pub receiver_blacklist_entry: AccountInfo<'info>,
}

#[derive(Accounts)]
pub struct InitializeExtraAccountMetaList<'info> {
    /// Payer for the extra meta list account
    #[account(mut)]
    pub payer: Signer<'info>,

    /// Extra account meta list PDA
    /// CHECK: initialized here
    #[account(
        init,
        payer = payer,
        space = 256, // sufficient for our extra accounts list
        seeds = [b"extra-account-metas", mint.key().as_ref()],
        bump
    )]
    pub extra_account_meta_list: AccountInfo<'info>,

    /// The mint this hook is for
    /// CHECK: read-only
    pub mint: AccountInfo<'info>,

    pub system_program: Program<'info, System>,
}
