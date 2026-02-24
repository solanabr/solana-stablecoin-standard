use anyhow::Result;
use colored::Colorize;
use solana_sdk::account::ReadableAccount;

use crate::config::CliContext;
use crate::utils;

pub async fn execute(ctx: &CliContext, mint_str: &str) -> Result<()> {
  let mint = utils::parse_pubkey(mint_str)?;
  let (config_pda, _) = utils::derive_config_pda(&mint);

  let account = ctx.client.get_account(&config_pda)
    .map_err(|_| anyhow::anyhow!("Stablecoin config not found for mint {}", mint_str))?;

  // Deserialize the config account (skip 8-byte discriminator)
  let data = account.data();
  if data.len() < 8 + 32 + 32 + 1 + 1 {
    anyhow::bail!("Invalid config account data");
  }

  // Parse fields manually from account data
  let authority = solana_sdk::pubkey::Pubkey::try_from(&data[8..40]).unwrap();
  let mint_key = solana_sdk::pubkey::Pubkey::try_from(&data[40..72]).unwrap();
  let preset = data[72];
  let paused = data[73] != 0;

  // Option<u64>: 1 byte tag + 8 bytes value
  let (supply_cap, offset) = if data[74] == 1 {
    let cap = u64::from_le_bytes(data[75..83].try_into().unwrap());
    (Some(cap), 83)
  } else {
    (None, 75)
  };

  let total_minted = u64::from_le_bytes(data[offset..offset + 8].try_into().unwrap());
  let total_burned = u64::from_le_bytes(data[offset + 8..offset + 16].try_into().unwrap());
  let current_supply = total_minted.saturating_sub(total_burned);

  // Get mint decimals
  let mint_account = ctx.client.get_account(&mint_key)?;
  let decimals = mint_account.data()[44]; // Token-2022 mint: decimals at offset 44

  println!();
  println!("{}", "Stablecoin Info".bold().underline());
  println!("{}", "═".repeat(50));
  utils::print_field("Mint", &mint_key.to_string());
  utils::print_field("Authority", &authority.to_string());
  utils::print_field("Preset", utils::preset_name(preset));
  utils::print_field("Paused", if paused { "Yes" } else { "No" });

  match supply_cap {
    Some(cap) => utils::print_field("Supply Cap", &utils::format_amount(cap, decimals)),
    None => utils::print_field("Supply Cap", "Unlimited"),
  }

  utils::print_field("Total Minted", &utils::format_amount(total_minted, decimals));
  utils::print_field("Total Burned", &utils::format_amount(total_burned, decimals));
  utils::print_field("Supply", &utils::format_amount(current_supply, decimals));
  utils::print_field("Config PDA", &config_pda.to_string());
  println!();

  Ok(())
}
