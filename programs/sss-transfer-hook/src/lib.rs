//! SSS Transfer Hook: enforces the SSS-2 blacklist on every token transfer.
//!
//! When a Token-2022 transfer occurs on an SSS-2 mint, this program is invoked
//! via CPI. It checks if the source owner or destination is on the blacklist
//! and rejects the transfer if so.
//!
//! This program ALSO acts as the permanent delegate for freeze/seize operations
//! in SSS-2. The PDA seeds ["sss-delegate", mint] holds that authority.

use anchor_lang::prelude::*;
use anchor_spl::token_interface::{Mint, TokenAccount};
use spl_tlv_account_resolution::{account::ExtraAccountMeta, state::ExtraAccountMetaList};
use spl_transfer_hook_interface::instruction::{ExecuteInstruction, TransferHookInstruction};

// We derive blacklist entry PDA seeds independently — no import from sss-core needed
// since we only check for existence (lamports > 0), not account data.

declare_id!("SSSHooKvTgEyqsX1mEBHXrLHyWzGGY9V8tECJpJPZyp");

pub mod error;

use error::HookError;

const EXTRA_ACCOUNT_METAS_SEED: &[u8] = b"extra-account-metas";
const BLACKLIST_SEED: &[u8] = b"blacklist";

#[program]
pub mod sss_transfer_hook {
    use super::*;

    /// Create the ExtraAccountMetaList account for this mint.
    /// Called once per mint during SSS-2 initialization.
    pub fn initialize_extra_account_meta_list(
        ctx: Context<InitializeExtraAccountMetaList>,
    ) -> Result<()> {
        // We store the blacklist PDA seeds so the hook can verify on every transfer.
        // The transfer hook receives: [source, mint, dest, owner, extra_meta_list, src_blacklist, dst_blacklist]
        let account_metas = vec![
            // index 5: source owner blacklist entry PDA
            ExtraAccountMeta::new_with_seeds(
                &[
                    spl_tlv_account_resolution::seeds::Seed::Literal {
                        bytes: BLACKLIST_SEED.to_vec(),
                    },
                    spl_tlv_account_resolution::seeds::Seed::AccountKey { index: 1 }, // mint
                    spl_tlv_account_resolution::seeds::Seed::AccountData {
                        account_index: 0, // source token account
                        data_index: 32,   // owner field offset in token account
                        length: 32,
                    },
                ],
                false, // not a signer
                false, // not writable
            )?,
            // index 6: destination owner blacklist entry PDA
            ExtraAccountMeta::new_with_seeds(
                &[
                    spl_tlv_account_resolution::seeds::Seed::Literal {
                        bytes: BLACKLIST_SEED.to_vec(),
                    },
                    spl_tlv_account_resolution::seeds::Seed::AccountKey { index: 1 }, // mint
                    spl_tlv_account_resolution::seeds::Seed::AccountData {
                        account_index: 2, // destination token account
                        data_index: 32,   // owner field offset
                        length: 32,
                    },
                ],
                false,
                false,
            )?,
        ];

        let account_size = ExtraAccountMetaList::size_of(account_metas.len())? as u64;
        let lamports = Rent::get()?.minimum_balance(account_size as usize);

        let mint_key = ctx.accounts.mint.key();
        let signer_seeds: &[&[&[u8]]] = &[&[
            EXTRA_ACCOUNT_METAS_SEED,
            mint_key.as_ref(),
            &[ctx.bumps.extra_account_meta_list],
        ]];

        anchor_lang::system_program::create_account(
            CpiContext::new_with_signer(
                ctx.accounts.system_program.to_account_info(),
                anchor_lang::system_program::CreateAccount {
                    from: ctx.accounts.payer.to_account_info(),
                    to: ctx.accounts.extra_account_meta_list.to_account_info(),
                },
                signer_seeds,
            ),
            lamports,
            account_size,
            ctx.program_id,
        )?;

        ExtraAccountMetaList::init::<ExecuteInstruction>(
            &mut ctx
                .accounts
                .extra_account_meta_list
                .try_borrow_mut_data()?,
            &account_metas,
        )?;

        Ok(())
    }

    /// The transfer hook execute instruction — called by Token-2022 on every transfer.
    pub fn transfer_hook(ctx: Context<TransferHook>, _amount: u64) -> Result<()> {
        // If a blacklist entry PDA exists for source or destination owner, block the transfer.
        // The PDA accounts are passed as remaining_accounts (indices 5 & 6).
        // When the account doesn't exist it still gets passed but with zero lamports.

        let src_blacklist = &ctx.accounts.src_owner_blacklist;
        let dst_blacklist = &ctx.accounts.dst_owner_blacklist;

        if src_blacklist.lamports() > 0 {
            return err!(HookError::SenderBlacklisted);
        }
        if dst_blacklist.lamports() > 0 {
            return err!(HookError::RecipientBlacklisted);
        }

        Ok(())
    }

    /// Fallback needed because Token-2022 calls using the Transfer Hook Interface discriminator,
    /// not the Anchor discriminator.
    pub fn fallback<'info>(
        program_id: &Pubkey,
        accounts: &'info [AccountInfo<'info>],
        data: &[u8],
    ) -> Result<()> {
        let instruction = TransferHookInstruction::unpack(data)?;
        match instruction {
            TransferHookInstruction::Execute { amount } => {
                let amount_bytes = amount.to_le_bytes();
                __private::__global::transfer_hook(program_id, accounts, &amount_bytes)
            }
            _ => Err(ProgramError::InvalidInstructionData.into()),
        }
    }
}

#[derive(Accounts)]
pub struct InitializeExtraAccountMetaList<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    /// CHECK: Validated by seeds.
    #[account(
        mut,
        seeds = [EXTRA_ACCOUNT_METAS_SEED, mint.key().as_ref()],
        bump,
    )]
    pub extra_account_meta_list: AccountInfo<'info>,

    pub mint: InterfaceAccount<'info, Mint>,

    pub system_program: Program<'info, System>,
}

// Order matters — Token-2022 provides accounts in this exact order.
#[derive(Accounts)]
pub struct TransferHook<'info> {
    #[account(token::mint = mint, token::authority = owner)]
    pub source_token: InterfaceAccount<'info, TokenAccount>,

    pub mint: InterfaceAccount<'info, Mint>,

    #[account(token::mint = mint)]
    pub destination_token: InterfaceAccount<'info, TokenAccount>,

    /// CHECK: source token account owner.
    pub owner: UncheckedAccount<'info>,

    /// CHECK: ExtraAccountMetaList PDA.
    #[account(seeds = [EXTRA_ACCOUNT_METAS_SEED, mint.key().as_ref()], bump)]
    pub extra_account_meta_list: UncheckedAccount<'info>,

    /// CHECK: Blacklist PDA for source owner. Zero lamports = not blacklisted.
    pub src_owner_blacklist: UncheckedAccount<'info>,

    /// CHECK: Blacklist PDA for destination owner. Zero lamports = not blacklisted.
    pub dst_owner_blacklist: UncheckedAccount<'info>,
}
