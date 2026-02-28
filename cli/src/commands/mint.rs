use anchor_lang::InstructionData;
use anchor_lang::ToAccountMetas;
use anyhow::Result;
use solana_sdk::instruction::Instruction;
use solana_sdk::transaction::Transaction;

use crate::config::CliContext;
use crate::utils;

pub async fn execute(
  ctx: &CliContext,
  mint_str: &str,
  to_str: &str,
  amount: u64,
) -> Result<()> {
  let mint = utils::parse_pubkey(mint_str)?;
  let to_owner = utils::parse_pubkey(to_str)?;
  let payer = ctx.payer_pubkey();

  // Derive the ATA for the recipient
  let to_ata = spl_associated_token_account::get_associated_token_address_with_program_id(
    &to_owner,
    &mint,
    &spl_token_2022::id(),
  );

  // Derive PDAs
  let (config_pda, _) = utils::derive_config_pda(&mint);
  let (minter_role_pda, _) = utils::derive_role_pda(&config_pda, &payer, 1); // Minter = 1

  let ix_data = sss_core::instruction::MintTokens { amount }.data();
  let accounts = sss_core::accounts::MintTokens {
    minter: payer,
    config: config_pda,
    minter_role: minter_role_pda,
    mint,
    to: to_ata,
    token_program: spl_token_2022::id(),
  }.to_account_metas(None);

  let ix = Instruction {
    program_id: sss_core::ID,
    accounts,
    data: ix_data,
  };

  // Optionally create the ATA if it doesn't exist
  let mut ixs = Vec::new();
  if ctx.client.get_account(&to_ata).is_err() {
    ixs.push(
      spl_associated_token_account::instruction::create_associated_token_account(
        &payer,
        &to_owner,
        &mint,
        &spl_token_2022::id(),
      ),
    );
  }
  ixs.push(ix);

  let recent_blockhash = ctx.client.get_latest_blockhash()?;
  let tx = Transaction::new_signed_with_payer(
    &ixs,
    Some(&payer),
    &[&ctx.payer],
    recent_blockhash,
  );

  let sig = ctx.client.send_and_confirm_transaction(&tx)?;

  utils::print_success(&format!("Minted {} tokens", amount));
  utils::print_field("Mint", mint_str);
  utils::print_field("Recipient", to_str);
  utils::print_field("Token Account", &to_ata.to_string());
  println!();
  utils::print_tx(&sig.to_string());

  Ok(())
}
