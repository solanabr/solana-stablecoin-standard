use anchor_lang::InstructionData;
use anchor_lang::ToAccountMetas;
use anyhow::Result;
use solana_sdk::instruction::Instruction;
use solana_sdk::signer::Signer;
use solana_sdk::transaction::Transaction;

use crate::config::CliContext;
use crate::BlacklistAction;
use crate::utils;

pub async fn execute(ctx: &CliContext, action: BlacklistAction) -> Result<()> {
  match action {
    BlacklistAction::Add { mint, address, reason } => add(ctx, &mint, &address, &reason).await,
    BlacklistAction::Remove { mint, address } => remove(ctx, &mint, &address).await,
    BlacklistAction::Check { mint, address } => check(ctx, &mint, &address).await,
  }
}

async fn add(ctx: &CliContext, mint_str: &str, address_str: &str, reason: &str) -> Result<()> {
  let mint = utils::parse_pubkey(mint_str)?;
  let address = utils::parse_pubkey(address_str)?;
  let payer = ctx.payer_pubkey();

  let (config_pda, _) = utils::derive_config_pda(&mint);
  let (blacklister_role_pda, _) = utils::derive_role_pda(&config_pda, &payer, 5); // Blacklister = 5
  let (blacklist_pda, _) = utils::derive_blacklist_pda(&mint, &address);

  let ix_data = sss_transfer_hook::instruction::AddToBlacklist {
    reason: reason.to_string(),
  }.data();
  let accounts = sss_transfer_hook::accounts::AddToBlacklist {
    blacklister: payer,
    blacklister_role: blacklister_role_pda,
    mint,
    address,
    blacklist_entry: blacklist_pda,
    system_program: solana_sdk::system_program::id(),
  }.to_account_metas(None);

  let ix = Instruction {
    program_id: sss_transfer_hook::ID,
    accounts,
    data: ix_data,
  };

  let recent_blockhash = ctx.client.get_latest_blockhash()?;
  let tx = Transaction::new_signed_with_payer(&[ix], Some(&payer), &[&ctx.payer], recent_blockhash);
  let sig = ctx.client.send_and_confirm_transaction(&tx)?;

  utils::print_success(&format!("Blacklisted {}", address_str));
  utils::print_field("Reason", reason);
  utils::print_tx(&sig.to_string());

  Ok(())
}

async fn remove(ctx: &CliContext, mint_str: &str, address_str: &str) -> Result<()> {
  let mint = utils::parse_pubkey(mint_str)?;
  let address = utils::parse_pubkey(address_str)?;
  let payer = ctx.payer_pubkey();

  let (config_pda, _) = utils::derive_config_pda(&mint);
  let (blacklister_role_pda, _) = utils::derive_role_pda(&config_pda, &payer, 5); // Blacklister = 5
  let (blacklist_pda, _) = utils::derive_blacklist_pda(&mint, &address);

  let ix_data = sss_transfer_hook::instruction::RemoveFromBlacklist.data();
  let accounts = sss_transfer_hook::accounts::RemoveFromBlacklist {
    blacklister: payer,
    blacklister_role: blacklister_role_pda,
    mint,
    blacklist_entry: blacklist_pda,
  }.to_account_metas(None);

  let ix = Instruction {
    program_id: sss_transfer_hook::ID,
    accounts,
    data: ix_data,
  };

  let recent_blockhash = ctx.client.get_latest_blockhash()?;
  let tx = Transaction::new_signed_with_payer(&[ix], Some(&payer), &[&ctx.payer], recent_blockhash);
  let sig = ctx.client.send_and_confirm_transaction(&tx)?;

  utils::print_success(&format!("Removed {} from blacklist", address_str));
  utils::print_tx(&sig.to_string());

  Ok(())
}

async fn check(ctx: &CliContext, mint_str: &str, address_str: &str) -> Result<()> {
  let mint = utils::parse_pubkey(mint_str)?;
  let address = utils::parse_pubkey(address_str)?;
  let (blacklist_pda, _) = utils::derive_blacklist_pda(&mint, &address);

  let is_blacklisted = ctx.client.get_account(&blacklist_pda).is_ok();

  println!();
  utils::print_field("Address", address_str);
  utils::print_field("Blacklisted", if is_blacklisted { "Yes" } else { "No" });
  println!();

  Ok(())
}
