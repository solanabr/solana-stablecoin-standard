use anyhow::Result;
use solana_client::rpc_config::{RpcAccountInfoConfig, RpcProgramAccountsConfig};
use solana_client::rpc_filter::{Memcmp, RpcFilterType};
use solana_sdk::pubkey::Pubkey;

use crate::config::CliContext;
use crate::utils;

pub async fn execute(ctx: &CliContext, mint_str: &str, min_balance: Option<u64>) -> Result<()> {
  let mint = utils::parse_pubkey(mint_str)?;

  println!("Fetching token holders for mint {}...", mint);
  println!();

  // Token-2022 account layout: first 32 bytes = mint pubkey
  let filters = vec![
    RpcFilterType::Memcmp(Memcmp::new_raw_bytes(0, mint.to_bytes().to_vec())),
    RpcFilterType::DataSize(165), // Standard token account size
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
    &spl_token_2022::id(),
    config,
  )?;

  if accounts.is_empty() {
    println!("No token holders found.");
    return Ok(());
  }

  // Parse and filter accounts
  let mut holders: Vec<(Pubkey, Pubkey, u64)> = Vec::new();

  for (address, account) in &accounts {
    let data = &account.data;
    if data.len() < 72 {
      continue;
    }

    // Owner at offset 32 (32 bytes), amount at offset 64 (8 bytes LE)
    let owner = Pubkey::try_from(&data[32..64])
      .unwrap_or_default();
    let amount = u64::from_le_bytes(
      data[64..72].try_into().unwrap_or_default(),
    );

    if let Some(min) = min_balance {
      if amount < min {
        continue;
      }
    }

    holders.push((*address, owner, amount));
  }

  // Sort by balance descending
  holders.sort_by(|a, b| b.2.cmp(&a.2));

  // Print table
  println!(
    "{:<46} {:<46} {:>16}",
    "TOKEN ACCOUNT", "OWNER", "BALANCE"
  );
  println!("{}", "-".repeat(110));

  for (address, owner, amount) in &holders {
    println!(
      "{:<46} {:<46} {:>16}",
      address, owner, amount,
    );
  }

  println!();
  println!("Total holders: {}", holders.len());

  Ok(())
}
