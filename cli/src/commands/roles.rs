use anchor_lang::InstructionData;
use anchor_lang::ToAccountMetas;
use anyhow::Result;
use solana_sdk::instruction::Instruction;
use solana_sdk::signer::Signer;
use solana_sdk::transaction::Transaction;

use crate::config::CliContext;
use crate::RoleAction;
use crate::utils;

pub async fn execute(ctx: &CliContext, action: RoleAction) -> Result<()> {
  match action {
    RoleAction::Grant { mint, address, role } => grant(ctx, &mint, &address, &role).await,
    RoleAction::Revoke { mint, address, role } => revoke(ctx, &mint, &address, &role).await,
    RoleAction::List { mint } => list(ctx, &mint).await,
  }
}

async fn grant(ctx: &CliContext, mint_str: &str, address_str: &str, role_str: &str) -> Result<()> {
  let mint = utils::parse_pubkey(mint_str)?;
  let grantee = utils::parse_pubkey(address_str)?;
  let role = utils::parse_role(role_str)?;
  let payer = ctx.payer_pubkey();

  let (config_pda, _) = utils::derive_config_pda(&mint);
  let (admin_role_pda, _) = utils::derive_role_pda(&config_pda, &payer, 0); // Admin = 0
  let (new_role_pda, _) = utils::derive_role_pda(&config_pda, &grantee, role);

  let ix_data = sss_core::instruction::GrantRole { role }.data();
  let accounts = sss_core::accounts::GrantRole {
    admin: payer,
    config: config_pda,
    admin_role: admin_role_pda,
    grantee: grantee,
    role_account: new_role_pda,
    system_program: solana_sdk::system_program::id(),
  }.to_account_metas(None);

  let ix = Instruction {
    program_id: sss_core::ID,
    accounts,
    data: ix_data,
  };

  let recent_blockhash = ctx.client.get_latest_blockhash()?;
  let tx = Transaction::new_signed_with_payer(&[ix], Some(&payer), &[&ctx.payer], recent_blockhash);
  let sig = ctx.client.send_and_confirm_transaction(&tx)?;

  utils::print_success(&format!("Granted {} role to {}", utils::role_name(role), address_str));
  utils::print_tx(&sig.to_string());

  Ok(())
}

async fn revoke(ctx: &CliContext, mint_str: &str, address_str: &str, role_str: &str) -> Result<()> {
  let mint = utils::parse_pubkey(mint_str)?;
  let address = utils::parse_pubkey(address_str)?;
  let role = utils::parse_role(role_str)?;
  let payer = ctx.payer_pubkey();

  let (config_pda, _) = utils::derive_config_pda(&mint);
  let (admin_role_pda, _) = utils::derive_role_pda(&config_pda, &payer, 0);
  let (role_account_pda, _) = utils::derive_role_pda(&config_pda, &address, role);

  let ix_data = sss_core::instruction::RevokeRole.data();
  let accounts = sss_core::accounts::RevokeRole {
    admin: payer,
    config: config_pda,
    admin_role: admin_role_pda,
    role_account: role_account_pda,
  }.to_account_metas(None);

  let ix = Instruction {
    program_id: sss_core::ID,
    accounts,
    data: ix_data,
  };

  let recent_blockhash = ctx.client.get_latest_blockhash()?;
  let tx = Transaction::new_signed_with_payer(&[ix], Some(&payer), &[&ctx.payer], recent_blockhash);
  let sig = ctx.client.send_and_confirm_transaction(&tx)?;

  utils::print_success(&format!("Revoked {} role from {}", utils::role_name(role), address_str));
  utils::print_tx(&sig.to_string());

  Ok(())
}

async fn list(ctx: &CliContext, mint_str: &str) -> Result<()> {
  let mint = utils::parse_pubkey(mint_str)?;
  let payer = ctx.payer_pubkey();
  let (config_pda, _) = utils::derive_config_pda(&mint);

  println!("\nRoles for {} on mint {}\n", payer, mint_str);

  for (role_u8, role_name) in [(0, "Admin"), (1, "Minter"), (2, "Freezer"), (3, "Pauser")] {
    let (role_pda, _) = utils::derive_role_pda(&config_pda, &payer, role_u8);
    let has_role = ctx.client.get_account(&role_pda).is_ok();
    let status = if has_role { "✓".to_string() } else { "✗".to_string() };
    println!("  {} {}", status, role_name);
  }
  println!();

  Ok(())
}
