use anchor_lang::InstructionData;
use anchor_lang::ToAccountMetas;
use anyhow::Result;
use solana_sdk::instruction::Instruction;
use solana_sdk::signer::Signer;
use solana_sdk::transaction::Transaction;

use crate::config::CliContext;
use crate::utils;

pub async fn execute(
  ctx: &CliContext,
  mint_str: &str,
  from_str: &str,
  amount: u64,
) -> Result<()> {
  let mint = utils::parse_pubkey(mint_str)?;
  let from_owner = utils::parse_pubkey(from_str)?;
  let payer = ctx.payer_pubkey();

  // Derive the ATA for the source
  let from_ata = spl_associated_token_account::get_associated_token_address_with_program_id(
    &from_owner,
    &mint,
    &spl_token_2022::id(),
  );

  // Derive PDAs
  let (config_pda, _) = utils::derive_config_pda(&mint);
  let (burner_role_pda, _) = utils::derive_role_pda(&config_pda, &payer, 4); // Burner = 4

  let ix_data = sss_core::instruction::BurnTokens { amount }.data();
  let accounts = sss_core::accounts::BurnTokens {
    burner: payer,
    config: config_pda,
    burner_role: burner_role_pda,
    mint,
    from: from_ata,
    token_program: spl_token_2022::id(),
  }.to_account_metas(None);

  let ix = Instruction {
    program_id: sss_core::ID,
    accounts,
    data: ix_data,
  };

  let recent_blockhash = ctx.client.get_latest_blockhash()?;
  let tx = Transaction::new_signed_with_payer(
    &[ix],
    Some(&payer),
    &[&ctx.payer],
    recent_blockhash,
  );

  let sig = ctx.client.send_and_confirm_transaction(&tx)?;

  utils::print_success(&format!("Burned {} tokens", amount));
  utils::print_field("Mint", mint_str);
  utils::print_field("From", from_str);
  utils::print_field("Token Account", &from_ata.to_string());
  println!();
  utils::print_tx(&sig.to_string());

  Ok(())
}
