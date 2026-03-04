use anchor_lang::prelude::*;
use anchor_lang::system_program;
use spl_tlv_account_resolution::{
    account::ExtraAccountMeta, seeds::Seed, state::ExtraAccountMetaList,
};

use sss_token::state::TokenConfig;

/// Sets up the ExtraAccountMetaList for this mint. This tells Token-2022 which
/// additional accounts to pass when invoking the transfer hook. We need:
///   1. TokenConfig PDA (from sss-token program)
///   2. Blacklist PDA (from sss-token program)
///
/// Must be called once per SSS-2 mint after initialization.
#[derive(Accounts)]
pub struct InitializeExtraMetas<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    /// CHECK: Must be the mint this hook is installed on
    pub mint: UncheckedAccount<'info>,

    /// The ExtraAccountMetaList PDA — Token-2022 looks this up by convention
    /// CHECK: Created in handler
    #[account(
        mut,
        seeds = [b"extra-account-metas", mint.key().as_ref()],
        bump,
    )]
    pub extra_account_meta_list: UncheckedAccount<'info>,

    /// The SSS token program — needed so we can reference its PDAs
    /// CHECK: We just read the program ID
    pub sss_token_program: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<InitializeExtraMetas>) -> Result<()> {
    let mint_key = ctx.accounts.mint.key();
    let sss_program = ctx.accounts.sss_token_program.key();

    // Derive the config PDA address from the sss-token program
    let (config_pda, _) = Pubkey::find_program_address(
        &[b"sss_config", mint_key.as_ref()],
        &sss_program,
    );

    // Derive the blacklist PDA address
    let (blacklist_pda, _) = Pubkey::find_program_address(
        &[b"sss_blacklist", config_pda.as_ref()],
        &sss_program,
    );

    // Build the extra account metas:
    //   [0] = TokenConfig (read-only, from sss-token program PDAs)
    //   [1] = Blacklist (read-only, from sss-token program PDAs)
    let extra_metas = vec![
        // Config PDA — seeds: [b"sss_config", mint.key().as_ref()]
        // Using literal address since PDA seeds reference accounts from another program
        ExtraAccountMeta::new_with_pubkey(&config_pda, false, false)?,
        // Blacklist PDA
        ExtraAccountMeta::new_with_pubkey(&blacklist_pda, false, false)?,
    ];

    // Calculate space needed
    let account_size = ExtraAccountMetaList::size_of(extra_metas.len())?;
    let lamports = Rent::get()?.minimum_balance(account_size);

    let bump = ctx.bumps.extra_account_meta_list;
    let signer_seeds: &[&[u8]] = &[b"extra-account-metas", mint_key.as_ref(), &[bump]];

    // Create the account
    system_program::create_account(
        CpiContext::new_with_signer(
            ctx.accounts.system_program.to_account_info(),
            system_program::CreateAccount {
                from: ctx.accounts.payer.to_account_info(),
                to: ctx.accounts.extra_account_meta_list.to_account_info(),
            },
            &[signer_seeds],
        ),
        lamports,
        account_size as u64,
        ctx.program_id,
    )?;

    // Write the list
    let mut data = ctx.accounts.extra_account_meta_list.try_borrow_mut_data()?;
    ExtraAccountMetaList::init::<ExecuteInstruction>(&mut data, &extra_metas)?;

    msg!(
        "Extra account metas initialized for mint {} (config={}, blacklist={})",
        mint_key,
        config_pda,
        blacklist_pda
    );
    Ok(())
}

// Placeholder type for ExtraAccountMetaList::init generic
struct ExecuteInstruction;
impl spl_transfer_hook_interface::instruction::ExecuteInstruction for ExecuteInstruction {}
