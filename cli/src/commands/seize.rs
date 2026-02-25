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
  to_str: &str,
  amount: u64,
) -> Result<()> {
  let mint = utils::parse_pubkey(mint_str)?;
  let from_account = utils::parse_pubkey(from_str)?;
  let to_account = utils::parse_pubkey(to_str)?;
  let payer = ctx.payer_pubkey();

  // Derive PDAs
  let (config_pda, _) = utils::derive_config_pda(&mint);
  let (seizer_role_pda, _) = utils::derive_role_pda(&config_pda, &payer, 6); // Seizer = 6

  let ix_data = sss_core::instruction::Seize { amount }.data();
  let accounts = sss_core::accounts::Seize {
    seizer: payer,
    config: config_pda,
    seizer_role: seizer_role_pda,
    mint,
    from: from_account,
    to: to_account,
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

  utils::print_success(&format!("Seized {} tokens", amount));
  utils::print_field("Mint", mint_str);
  utils::print_field("From", from_str);
  utils::print_field("To", to_str);
  println!();
  utils::print_tx(&sig.to_string());

  Ok(())
}
