use anchor_lang::prelude::*;
use anchor_lang::system_program;
use anchor_spl::token_interface::Mint;
use spl_tlv_account_resolution::{
  account::ExtraAccountMeta, seeds::Seed, state::ExtraAccountMetaList,
};
use spl_transfer_hook_interface::instruction::ExecuteInstruction;

use crate::constants::BLACKLIST_SEED;

#[derive(Accounts)]
pub struct InitializeExtraAccountMetas<'info> {
  #[account(mut)]
  pub payer: Signer<'info>,

  /// CHECK: Validated via seeds constraint — the ExtraAccountMetaList PDA
  /// for this mint. Created and initialized in this instruction.
  #[account(
    mut,
    seeds = [b"extra-account-metas", mint.key().as_ref()],
    bump,
  )]
  pub extra_account_metas: UncheckedAccount<'info>,

  pub mint: InterfaceAccount<'info, Mint>,
  pub system_program: Program<'info, System>,
}

pub fn handler_initialize(ctx: Context<InitializeExtraAccountMetas>) -> Result<()> {
  let extra_account_metas = ctx.accounts.extra_account_metas.to_account_info();
  let mint = ctx.accounts.mint.to_account_info();

  // Define the extra account metas that Token-2022 must resolve during transfers.
  //
  // Transfer hook execute account ordering:
  //   0 = source token account
  //   1 = mint
  //   2 = destination token account
  //   3 = source authority (owner/delegate)
  //   4 = extra_account_metas PDA (validation state)
  //
  // We need two additional accounts (resolved by Token-2022):
  //   5 = sender blacklist PDA  (seeds: [b"blacklist", mint, source_authority])
  //   6 = receiver blacklist PDA (seeds: [b"blacklist", mint, dest_owner])
  let account_metas = vec![
    // Sender blacklist: PDA derived from this program with seeds
    // [b"blacklist", mint_pubkey, source_authority_pubkey]
    ExtraAccountMeta::new_with_seeds(
      &[
        Seed::Literal { bytes: BLACKLIST_SEED.to_vec() },
        Seed::AccountKey { index: 1 }, // mint
        Seed::AccountKey { index: 3 }, // source authority
      ],
      false, // is_signer
      false, // is_writable
    )?,
    // Receiver blacklist: PDA derived from this program with seeds
    // [b"blacklist", mint_pubkey, destination_owner]
    // The destination owner is extracted from the destination token account
    // data at offset 32, length 32 (the `owner` field in token account layout).
    ExtraAccountMeta::new_with_seeds(
      &[
        Seed::Literal { bytes: BLACKLIST_SEED.to_vec() },
        Seed::AccountKey { index: 1 }, // mint
        Seed::AccountData {
          account_index: 2,  // destination token account
          data_index: 32,    // offset of `owner` field in token account
          length: 32,        // Pubkey is 32 bytes
        },
      ],
      false,
      false,
    )?,
  ];

  // Calculate required account size for the ExtraAccountMetaList.
  let account_size = ExtraAccountMetaList::size_of(account_metas.len())?;

  // Allocate the ExtraAccountMetaList PDA via SystemProgram.
  let lamports = Rent::get()?.minimum_balance(account_size);
  let signer_seeds: &[&[u8]] = &[
    b"extra-account-metas",
    mint.key.as_ref(),
    &[ctx.bumps.extra_account_metas],
  ];

  system_program::create_account(
    CpiContext::new_with_signer(
      ctx.accounts.system_program.to_account_info(),
      system_program::CreateAccount {
        from: ctx.accounts.payer.to_account_info(),
        to: extra_account_metas.clone(),
      },
      &[signer_seeds],
    ),
    lamports,
    account_size as u64,
    ctx.program_id,
  )?;

  // Initialize the ExtraAccountMetaList with our defined metas.
  ExtraAccountMetaList::init::<ExecuteInstruction>(
    &mut extra_account_metas.try_borrow_mut_data()?,
    &account_metas,
  )?;

  Ok(())
}
