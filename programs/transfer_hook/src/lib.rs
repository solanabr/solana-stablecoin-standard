use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token_interface::{Mint, TokenInterface};
use spl_tlv_account_resolution::{
    account::ExtraAccountMeta, seeds::Seed, state::ExtraAccountMetaList,
};
use spl_transfer_hook_interface::instruction::ExecuteInstruction;
use solana_program::system_instruction;
use solana_program::program::invoke_signed;

pub mod state;
pub mod error;
pub mod instructions;

use instructions::execute::*;
use instructions::manage::*;

declare_id!("5cs7VzZny1XMj4TAJy2xVqo2tCHM8Vwe9bNbL6uRmbxk"); // Вставь свой ID

#[program]
pub mod transfer_hook {
    use super::*;

    pub fn add_to_blacklist(ctx: Context<ManageBlacklist>, wallet: Pubkey) -> Result<()> {
        instructions::manage::add_to_blacklist(ctx, wallet)
    }

    #[interface(spl_transfer_hook_interface::execute)]
    pub fn execute(ctx: Context<Execute>, amount: u64) -> Result<()> {
        instructions::execute::process_execute(ctx, amount)
    }
    
    pub fn initialize_extra_account_meta_list(
        ctx: Context<InitializeExtraAccountMetaList>,
    ) -> Result<()> {
        // Требуем ТОЛЬКО 1 дополнительный аккаунт: PDA блэклиста для отправителя
        // Индекс 3 — это `owner_delegate` (тот, кто подписывает перевод)
        let account_metas = vec![
            ExtraAccountMeta::new_with_seeds(
                &[
                    Seed::Literal { bytes: b"blacklist".to_vec() },
                    Seed::AccountKey { index: 3 }, 
                ],
                false, // is_signer
                false, // is_writable
            )?,
        ];

        let account_size = ExtraAccountMetaList::size_of(account_metas.len())? as u64;
        let lamports = Rent::get()?.minimum_balance(account_size as usize);
        let mint = ctx.accounts.mint.key();
        let signer_seeds: &[&[&[u8]]] = &[&[
            b"extra-account-metas".as_ref(),
            &mint.as_ref(),
            &[ctx.bumps.extra_account_meta_list],
        ]];

        // Create account
        invoke_signed(
            &system_instruction::create_account(
                &ctx.accounts.payer.key(),
                &ctx.accounts.extra_account_meta_list.key(),
                lamports,
                account_size,
                ctx.program_id,
            ),
            &[
                ctx.accounts.payer.to_account_info(),
                ctx.accounts.extra_account_meta_list.to_account_info(),
                ctx.accounts.system_program.to_account_info(),
            ],
            signer_seeds,
        )?;

        // Initialize list
        ExtraAccountMetaList::init::<ExecuteInstruction>(
            &mut ctx.accounts.extra_account_meta_list.try_borrow_mut_data()?,
            &account_metas,
        )?;

        Ok(())
    }
}

// Добавьте структуру Accounts
#[derive(Accounts)]
pub struct InitializeExtraAccountMetaList<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    /// CHECK: ExtraAccountMetaList Account
    #[account(
        mut,
        seeds = [b"extra-account-metas", mint.key().as_ref()],
        bump
    )]
    pub extra_account_meta_list: AccountInfo<'info>,

    pub mint: InterfaceAccount<'info, Mint>,
    pub wsol_mint: InterfaceAccount<'info, Mint>,
    pub token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}