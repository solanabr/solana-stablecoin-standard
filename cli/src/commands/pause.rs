use anchor_lang::InstructionData;
use anchor_lang::ToAccountMetas;
use anyhow::Result;
use solana_sdk::instruction::Instruction;
use solana_sdk::signer::Signer;
use solana_sdk::transaction::Transaction;

use crate::config::CliContext;
use crate::utils;

/// Shared handler for pause and unpause commands.
pub async fn execute(
  ctx: &CliContext,
  mint_str: &str,
  should_pause: bool,
) -> Result<()> {
  let mint = utils::parse_pubkey(mint_str)?;
  let payer = ctx.payer_pubkey();

  // Derive PDAs
  let (config_pda, _) = utils::derive_config_pda(&mint);
  let (pauser_role_pda, _) = utils::derive_role_pda(&config_pda, &payer, 3); // Pauser = 3

  let ix = if should_pause {
    let ix_data = sss_core::instruction::Pause {}.data();
    let accounts = sss_core::accounts::Pause {
      pauser: payer,
      config: config_pda,
      pauser_role: pauser_role_pda,
    }.to_account_metas(None);

    Instruction {
      program_id: sss_core::ID,
      accounts,
      data: ix_data,
    }
  } else {
    let ix_data = sss_core::instruction::Unpause {}.data();
    let accounts = sss_core::accounts::Unpause {
      pauser: payer,
      config: config_pda,
      pauser_role: pauser_role_pda,
    }.to_account_metas(None);

    Instruction {
      program_id: sss_core::ID,
      accounts,
      data: ix_data,
    }
  };

  let recent_blockhash = ctx.client.get_latest_blockhash()?;
  let tx = Transaction::new_signed_with_payer(
    &[ix],
    Some(&payer),
    &[&ctx.payer],
    recent_blockhash,
  );

  let sig = ctx.client.send_and_confirm_transaction(&tx)?;

  let action = if should_pause { "paused" } else { "unpaused" };
  utils::print_success(&format!("Operations {}", action));
  utils::print_field("Mint", mint_str);
  println!();
  utils::print_tx(&sig.to_string());

  Ok(())
}
