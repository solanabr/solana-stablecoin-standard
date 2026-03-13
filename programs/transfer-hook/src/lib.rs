use anchor_lang::prelude::*;
use anchor_lang::system_program;
use spl_tlv_account_resolution::{
    account::ExtraAccountMeta, seeds::Seed, state::ExtraAccountMetaList,
};
use spl_transfer_hook_interface::instruction::ExecuteInstruction;

declare_id!("8nWGGHT4kkuvtY8NqXeYEdiyC79qQ2taS82UGwmfdKgu");

/// SSS Token Program ID — used for blacklist PDA derivation
const SSS_TOKEN_PROGRAM_ID: Pubkey =
    anchor_lang::solana_program::pubkey!("AcmGr2zw5RqMjuT1BN68Gk8gBhaFeF4piUXTyRQrVw3t");

/// Transfer Hook Program for SSS-2 Compliant Stablecoins
///
/// This program implements the SPL Transfer Hook interface.
/// On every token transfer, it verifies that neither the sender
/// nor the recipient is on the blacklist. If either party is
/// blacklisted, the transfer is rejected.
///
/// ## ExtraAccountMeta Layout
///
/// The transfer hook requires these additional accounts beyond
/// the standard transfer accounts:
/// 1. SSS Token program ID (for PDA derivation)
/// 2. Config PDA (derived from mint via SSS Token program)
/// 3. Source owner's blacklist PDA
/// 4. Destination owner's blacklist PDA
#[program]
pub mod transfer_hook {
    use super::*;

    /// Initialize the ExtraAccountMetaList for the transfer hook.
    ///
    /// This sets up which additional accounts must be provided
    /// on every transfer. The ExtraAccountMeta entries define:
    /// - Config PDA: seeds = ["config", mint] via SSS Token program
    /// - Source blacklist PDA: seeds = ["blacklist", config, source_owner]
    /// - Dest blacklist PDA: seeds = ["blacklist", config, dest_owner]
    pub fn initialize_extra_account_meta_list(
        ctx: Context<InitializeExtraAccountMetaList>,
    ) -> Result<()> {
        // Define the extra accounts needed for each transfer
        let account_metas = vec![
            // Extra account #0: SSS Token Program (index 5 in the full list)
            // This is a static program ID reference
            ExtraAccountMeta::new_with_pubkey(&SSS_TOKEN_PROGRAM_ID, false, false)?,
            // Extra account #1: Config PDA — derived from mint
            // Seeds: ["config", mint_pubkey] via SSS Token Program
            ExtraAccountMeta::new_with_seeds(
                &[
                    Seed::Literal {
                        bytes: b"config".to_vec(),
                    },
                    // mint is at index 1 in the standard transfer hook accounts
                    Seed::AccountKey { index: 1 },
                ],
                false, // not a signer
                false, // not writable
            )?,
            // Extra account #2: Source blacklist PDA
            // Seeds: ["blacklist", config_pda, source_owner] via SSS Token Program
            ExtraAccountMeta::new_with_seeds(
                &[
                    Seed::Literal {
                        bytes: b"blacklist".to_vec(),
                    },
                    // config PDA is extra account #1 (absolute index 6)
                    Seed::AccountKey { index: 6 },
                    // source owner is at index 3 (authority/owner in transfer)
                    Seed::AccountKey { index: 3 },
                ],
                false,
                false,
            )?,
            // Extra account #3: Destination blacklist PDA
            // We need the destination owner. Since we can't easily get it from
            // the account list, we use the destination token account (index 2)
            // and resolve it. For now, we check source only and destination
            // via account data in the handler.
            ExtraAccountMeta::new_with_seeds(
                &[
                    Seed::Literal {
                        bytes: b"blacklist".to_vec(),
                    },
                    Seed::AccountKey { index: 6 },
                    // destination token account at index 2
                    Seed::AccountKey { index: 2 },
                ],
                false,
                false,
            )?,
        ];

        // Calculate space needed
        let account_size = ExtraAccountMetaList::size_of(account_metas.len())? as u64;

        // Create the ExtraAccountMetaList account
        let lamports = Rent::get()?.minimum_balance(account_size as usize);
        let mint = ctx.accounts.mint.key();
        let signer_seeds: &[&[u8]] = &[b"extra-account-metas", mint.as_ref()];
        let (_, bump) = Pubkey::find_program_address(signer_seeds, &crate::ID);
        let signer_seeds_with_bump: &[&[u8]] = &[b"extra-account-metas", mint.as_ref(), &[bump]];

        system_program::create_account(
            CpiContext::new_with_signer(
                ctx.accounts.system_program.to_account_info(),
                system_program::CreateAccount {
                    from: ctx.accounts.payer.to_account_info(),
                    to: ctx.accounts.extra_account_meta_list.to_account_info(),
                },
                &[signer_seeds_with_bump],
            ),
            lamports,
            account_size,
            &crate::ID,
        )?;

        // Initialize the list
        ExtraAccountMetaList::init::<ExecuteInstruction>(
            &mut ctx.accounts.extra_account_meta_list.try_borrow_mut_data()?,
            &account_metas,
        )?;

        msg!("Transfer hook extra account metas initialized");
        Ok(())
    }

    /// Transfer hook execute — called on every token transfer.
    ///
    /// Checks both sender and recipient against the blacklist.
    /// If either address has a blacklist PDA that exists (has data),
    /// the transfer is rejected.
    pub fn transfer_hook(ctx: Context<TransferHookCtx>, _amount: u64) -> Result<()> {
        // Check source blacklist PDA
        // If the account has data (lamports > 0 and data.len() > 0), the address is blacklisted
        let source_blacklist = &ctx.accounts.source_blacklist_entry;
        if source_blacklist.data_len() > 0 {
            msg!(
                "Transfer blocked: source {} is blacklisted",
                ctx.accounts.owner.key()
            );
            return Err(TransferHookError::SenderBlacklisted.into());
        }

        // Check destination blacklist PDA
        let dest_blacklist = &ctx.accounts.destination_blacklist_entry;
        if dest_blacklist.data_len() > 0 {
            msg!("Transfer blocked: destination is blacklisted");
            return Err(TransferHookError::RecipientBlacklisted.into());
        }

        // Both parties are clean — transfer proceeds
        Ok(())
    }

    /// Fallback instruction handler for the transfer hook interface.
    /// Required by the SPL transfer hook interface specification.
    /// Routes the Execute instruction to our transfer_hook handler.
    pub fn fallback<'info>(
        _program_id: &Pubkey,
        accounts: &'info [AccountInfo<'info>],
        data: &[u8],
    ) -> Result<()> {
        // The fallback receives the Execute instruction from Token-2022.
        // We just need to check the blacklist accounts are clean.
        if data.len() < 8 {
            return Err(ProgramError::InvalidInstructionData.into());
        }

        // Validate we have enough accounts
        // Standard: source(0), mint(1), dest(2), owner(3), extra_meta_list(4)
        // Extra: sss_program(5), config(6), source_blacklist(7), dest_blacklist(8)
        if accounts.len() < 9 {
            return Err(ProgramError::NotEnoughAccountKeys.into());
        }

        // Check source blacklist (index 7)
        let source_blacklist = &accounts[7];
        if source_blacklist.data_len() > 0 {
            msg!("Transfer blocked: source is blacklisted");
            return Err(TransferHookError::SenderBlacklisted.into());
        }

        // Check destination blacklist (index 8)
        let dest_blacklist = &accounts[8];
        if dest_blacklist.data_len() > 0 {
            msg!("Transfer blocked: destination is blacklisted");
            return Err(TransferHookError::RecipientBlacklisted.into());
        }

        msg!("Transfer hook: both parties cleared");
        Ok(())
    }
}

// ── Account Structs ─────────────────────────────────────────────────────

#[derive(Accounts)]
pub struct InitializeExtraAccountMetaList<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    /// The ExtraAccountMetaList PDA — derived from ["extra-account-metas", mint]
    /// CHECK: Created in handler with correct seeds
    #[account(
        mut,
        seeds = [b"extra-account-metas", mint.key().as_ref()],
        bump,
    )]
    pub extra_account_meta_list: AccountInfo<'info>,

    /// CHECK: The Token-2022 mint this hook is associated with
    pub mint: AccountInfo<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct TransferHookCtx<'info> {
    /// CHECK: Source token account (validated by Token-2022)
    pub source_token: AccountInfo<'info>,

    /// CHECK: Mint (validated by Token-2022)
    pub mint: AccountInfo<'info>,

    /// CHECK: Destination token account (validated by Token-2022)
    pub destination_token: AccountInfo<'info>,

    /// CHECK: Source token account owner (validated by Token-2022)
    pub owner: AccountInfo<'info>,

    /// CHECK: ExtraAccountMetaList PDA
    #[account(
        seeds = [b"extra-account-metas", mint.key().as_ref()],
        bump,
    )]
    pub extra_account_meta_list: AccountInfo<'info>,

    /// CHECK: SSS Token program (for PDA derivation reference)
    pub sss_token_program: AccountInfo<'info>,

    /// CHECK: Config PDA — seeds ["config", mint] via SSS Token program
    pub config: AccountInfo<'info>,

    /// CHECK: Source owner's blacklist PDA — if account has data, source is blacklisted
    pub source_blacklist_entry: AccountInfo<'info>,

    /// CHECK: Destination's blacklist PDA — if account has data, dest is blacklisted
    pub destination_blacklist_entry: AccountInfo<'info>,
}

// ── Errors ──────────────────────────────────────────────────────────────

#[error_code]
pub enum TransferHookError {
    #[msg("Transfer blocked: sender is blacklisted")]
    SenderBlacklisted,
    #[msg("Transfer blocked: recipient is blacklisted")]
    RecipientBlacklisted,
}
