use anchor_lang::prelude::*;
use anchor_spl::token_2022::Token2022;
use spl_tlv_account_resolution::{
    account::ExtraAccountMeta,
    seeds::Seed,
    state::ExtraAccountMetaList,
};
use crate::state::HookConfig;

#[derive(Accounts)]
pub struct InitializeExtraAccountMetaList<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    /// CHECK: ExtraAccountMetaList PDA, validated by seeds
    #[account(
        mut,
        seeds = [b"extra-account-metas", mint.key().as_ref()],
        bump,
    )]
    pub extra_account_meta_list: UncheckedAccount<'info>,

    /// CHECK: The mint
    pub mint: UncheckedAccount<'info>,

    #[account(
        seeds = [b"hook_config", mint.key().as_ref()],
        bump = hook_config.bump,
    )]
    pub hook_config: Account<'info, HookConfig>,

    pub token_program: Program<'info, Token2022>,
    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<InitializeExtraAccountMetaList>) -> Result<()> {
    // Define the 3 extra account metas for the transfer hook.
    // spl_tlv_account_resolution uses its own solana_program_error re-export
    // which may be a different crate instance than anchor's ProgramError.
    // We unwrap these infallible-in-practice calls (they only fail on bad seeds
    // length which is a programmer error, not runtime). Alternatively, map to
    // a known anchor ProgramError variant.
    let extra_metas = vec![
        // Meta 0: hook_config PDA
        // seeds: ["hook_config", mint_pubkey]
        ExtraAccountMeta::new_with_seeds(
            &[
                Seed::Literal { bytes: b"hook_config".to_vec() },
                Seed::AccountKey { index: 1 }, // mint account (index 1 in transfer hook)
            ],
            false, // is_signer
            false, // is_writable
        )
        .map_err(|_| ProgramError::InvalidArgument)?,
        // Meta 1: sender blacklist PDA (may not exist - lamports==0 means not blacklisted)
        // seeds: ["blacklist", hook_config_key, source_owner]
        // source is account index 0, owner is at offset 32 in token account data
        ExtraAccountMeta::new_with_seeds(
            &[
                Seed::Literal { bytes: b"blacklist".to_vec() },
                Seed::AccountKey { index: 5 }, // hook_config (first extra account, index 5)
                Seed::AccountData { account_index: 0, data_index: 32, length: 32 }, // source token account owner
            ],
            false,
            false,
        )
        .map_err(|_| ProgramError::InvalidArgument)?,
        // Meta 2: receiver blacklist PDA (may not exist)
        // seeds: ["blacklist", hook_config_key, dest_owner]
        // destination is account index 2, owner at offset 32
        ExtraAccountMeta::new_with_seeds(
            &[
                Seed::Literal { bytes: b"blacklist".to_vec() },
                Seed::AccountKey { index: 5 }, // hook_config
                Seed::AccountData { account_index: 2, data_index: 32, length: 32 }, // dest token account owner
            ],
            false,
            false,
        )
        .map_err(|_| ProgramError::InvalidArgument)?,
    ];

    // Calculate space and create account.
    let account_size = ExtraAccountMetaList::size_of(extra_metas.len())
        .map_err(|_| ProgramError::InvalidArgument)?;
    let lamports = Rent::get()?.minimum_balance(account_size);

    let mint_key = ctx.accounts.mint.key();
    let signer_seeds: &[&[u8]] = &[
        b"extra-account-metas",
        mint_key.as_ref(),
        &[ctx.bumps.extra_account_meta_list],
    ];

    anchor_lang::solana_program::program::invoke_signed(
        &anchor_lang::solana_program::system_instruction::create_account(
            ctx.accounts.payer.key,
            ctx.accounts.extra_account_meta_list.key,
            lamports,
            account_size as u64,
            &crate::id(),
        ),
        &[
            ctx.accounts.payer.to_account_info(),
            ctx.accounts.extra_account_meta_list.to_account_info(),
            ctx.accounts.system_program.to_account_info(),
        ],
        &[signer_seeds],
    )?;

    // Initialize the extra account meta list
    let mut data = ctx.accounts.extra_account_meta_list.try_borrow_mut_data()?;
    ExtraAccountMetaList::init::<spl_transfer_hook_interface::instruction::ExecuteInstruction>(
        &mut data,
        &extra_metas,
    )
    .map_err(|_| ProgramError::InvalidArgument)?;

    Ok(())
}
