use anyhow::Result;
use solana_client::rpc_config::{RpcAccountInfoConfig, RpcProgramAccountsConfig};
use solana_client::rpc_filter::{Memcmp, RpcFilterType};
use solana_sdk::pubkey::Pubkey;

use crate::config::CliContext;
use crate::utils;

/// List all addresses with the minter role for a given mint.
pub async fn list(ctx: &CliContext, mint_str: &str) -> Result<()> {
  let mint = utils::parse_pubkey(mint_str)?;
  let (config_pda, _) = utils::derive_config_pda(&mint);

  println!("Fetching minters for mint {}...", mint);
  println!();

  // RoleAccount layout after 8-byte discriminator:
  //   config: Pubkey (32 bytes)  [offset 8]
  //   address: Pubkey (32 bytes) [offset 40]
  //   role: u8 (1 byte)          [offset 72]
  //   bump: u8 (1 byte)          [offset 73]
  //
  // Filter by:
  //   1. config pubkey at offset 8 (matches our mint's config PDA)
  //   2. role byte = 1 (Minter) at offset 72

  let filters = vec![
    // Match config PDA
    RpcFilterType::Memcmp(Memcmp::new_raw_bytes(8, config_pda.to_bytes().to_vec())),
    // Match Minter role (enum variant 1)
    RpcFilterType::Memcmp(Memcmp::new_raw_bytes(72, vec![1u8])),
  ];

  let config = RpcProgramAccountsConfig {
    filters: Some(filters),
    account_config: RpcAccountInfoConfig {
      encoding: Some(solana_account_decoder::UiAccountEncoding::Base64),
      ..Default::default()
    },
    ..Default::default()
  };

  let accounts = ctx.client.get_program_accounts_with_config(
    &sss_core::ID,
    config,
  )?;

  if accounts.is_empty() {
    println!("No minters found.");
    return Ok(());
  }

  println!("{:<46} {:<46}", "MINTER ADDRESS", "ROLE PDA");
  println!("{}", "-".repeat(94));

  for (pda_address, account) in &accounts {
    let data = &account.data;
    if data.len() < 72 {
      continue;
    }

    let minter_address = Pubkey::try_from(&data[40..72])
      .unwrap_or_default();

    println!("{:<46} {:<46}", minter_address, pda_address);
  }

  println!();
  println!("Total minters: {}", accounts.len());

  Ok(())
}

/// Grant minter role (alias for `roles grant --role minter`).
pub async fn add(ctx: &CliContext, mint_str: &str, address_str: &str) -> Result<()> {
  println!("Granting minter role...");
  crate::commands::roles::execute(
    ctx,
    crate::RoleAction::Grant {
      mint: mint_str.to_string(),
      address: address_str.to_string(),
      role: "minter".to_string(),
    },
  ).await
}

/// Revoke minter role (alias for `roles revoke --role minter`).
pub async fn remove(ctx: &CliContext, mint_str: &str, address_str: &str) -> Result<()> {
  println!("Revoking minter role...");
  crate::commands::roles::execute(
    ctx,
    crate::RoleAction::Revoke {
      mint: mint_str.to_string(),
      address: address_str.to_string(),
      role: "minter".to_string(),
    },
  ).await
}
