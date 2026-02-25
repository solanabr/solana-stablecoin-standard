use anyhow::Result;
use solana_client::rpc_client::GetConfirmedSignaturesForAddress2Config;
use solana_sdk::commitment_config::CommitmentConfig;

use crate::config::CliContext;
use crate::utils;

pub async fn execute(
  ctx: &CliContext,
  mint_str: &str,
  action_filter: Option<String>,
  limit: usize,
) -> Result<()> {
  let mint = utils::parse_pubkey(mint_str)?;
  let (config_pda, _) = utils::derive_config_pda(&mint);

  println!("Fetching audit log for mint {}...", mint);
  if let Some(ref filter) = action_filter {
    println!("Filtering by action: {}", filter);
  }
  println!();

  let sig_config = GetConfirmedSignaturesForAddress2Config {
    before: None,
    until: None,
    limit: Some(limit),
    commitment: Some(CommitmentConfig::confirmed()),
  };

  let signatures = ctx.client.get_signatures_for_address_with_config(
    &config_pda,
    sig_config,
  )?;

  if signatures.is_empty() {
    println!("No transactions found.");
    return Ok(());
  }

  // Known SSS event names to detect in logs
  let event_names = [
    "StablecoinInitialized", "TokensMinted", "TokensBurned",
    "AccountFrozen", "AccountThawed", "TokensSeized",
    "Paused", "Unpaused", "RoleGranted", "RoleRevoked",
    "ConfigUpdated", "AuthorityTransferred",
    "BlacklistAdded", "BlacklistRemoved",
  ];

  println!(
    "{:<90} {:<24} {:>12} {}",
    "SIGNATURE", "ACTION", "SLOT", "STATUS"
  );
  println!("{}", "-".repeat(135));

  let mut count = 0;

  for sig_info in &signatures {
    // Detect action from memo or mark as "unknown"
    let memo = sig_info.memo.as_deref().unwrap_or("");
    let detected = event_names.iter()
      .find(|name| memo.contains(*name))
      .map(|s| s.to_string())
      .unwrap_or_else(|| "transaction".to_string());

    // Apply action filter
    if let Some(ref filter) = action_filter {
      let filter_lower = filter.to_lowercase();
      if !detected.to_lowercase().contains(&filter_lower) {
        continue;
      }
    }

    let status = if sig_info.err.is_some() { "FAILED" } else { "OK" };

    println!(
      "{:<90} {:<24} {:>12} {}",
      sig_info.signature,
      detected,
      sig_info.slot,
      status,
    );

    count += 1;
  }

  println!();
  println!("Showing {} of {} transactions", count, signatures.len());

  Ok(())
}
