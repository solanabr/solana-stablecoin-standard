use anyhow::{bail, Result};
use colored::Colorize;
use solana_sdk::pubkey::Pubkey;
use std::str::FromStr;

/// Parse a base58-encoded public key string.
pub fn parse_pubkey(s: &str) -> Result<Pubkey> {
  Pubkey::from_str(s)
    .map_err(|_| anyhow::anyhow!("Invalid base58 public key: {}", s))
}

/// Parse a role string to its u8 representation.
/// Matches the Role enum: Admin=0, Minter=1, Freezer=2, Pauser=3.
pub fn parse_role(s: &str) -> Result<u8> {
  match s.to_lowercase().as_str() {
    "admin" => Ok(0),
    "minter" => Ok(1),
    "freezer" => Ok(2),
    "pauser" => Ok(3),
    _ => bail!("Invalid role '{}'. Must be: admin, minter, freezer, pauser", s),
  }
}

/// Human-readable role name from u8.
pub fn role_name(role: u8) -> &'static str {
  match role {
    0 => "Admin",
    1 => "Minter",
    2 => "Freezer",
    3 => "Pauser",
    _ => "Unknown",
  }
}

/// Parse preset string to u8.
pub fn parse_preset(s: &str) -> Result<u8> {
  match s.to_lowercase().as_str() {
    "sss-1" | "1" => Ok(1),
    "sss-2" | "2" => Ok(2),
    "sss-3" | "3" => Ok(3),
    _ => bail!("Invalid preset '{}'. Must be: sss-1, sss-2, sss-3", s),
  }
}

/// Human-readable preset name from u8.
pub fn preset_name(preset: u8) -> &'static str {
  match preset {
    1 => "SSS-1 (Basic)",
    2 => "SSS-2 (Compliant)",
    3 => "SSS-3 (Confidential)",
    _ => "Unknown",
  }
}

/// Derive the StablecoinConfig PDA.
/// Seeds: [b"sss-config", mint]
pub fn derive_config_pda(mint: &Pubkey) -> (Pubkey, u8) {
  Pubkey::find_program_address(
    &[b"sss-config", mint.as_ref()],
    &sss_core::ID,
  )
}

/// Derive a RoleAccount PDA.
/// Seeds: [b"sss-role", config, address, &[role_u8]]
pub fn derive_role_pda(config: &Pubkey, address: &Pubkey, role: u8) -> (Pubkey, u8) {
  Pubkey::find_program_address(
    &[b"sss-role", config.as_ref(), address.as_ref(), &[role]],
    &sss_core::ID,
  )
}

/// Derive a BlacklistEntry PDA.
/// Seeds: [b"blacklist", mint, address]
pub fn derive_blacklist_pda(mint: &Pubkey, address: &Pubkey) -> (Pubkey, u8) {
  Pubkey::find_program_address(
    &[b"blacklist", mint.as_ref(), address.as_ref()],
    &sss_transfer_hook::ID,
  )
}

/// Derive the ExtraAccountMetas PDA for a mint.
/// Seeds: [b"extra-account-metas", mint]
pub fn derive_extra_account_metas_pda(mint: &Pubkey) -> (Pubkey, u8) {
  Pubkey::find_program_address(
    &[b"extra-account-metas", mint.as_ref()],
    &sss_transfer_hook::ID,
  )
}

/// Print a success message in green.
pub fn print_success(msg: &str) {
  println!("{}", msg.green());
}

/// Print a transaction signature with explorer link.
pub fn print_tx(sig: &str) {
  println!("{} {}", "Transaction:".bold(), sig);
  println!(
    "{} https://explorer.solana.com/tx/{}?cluster=custom",
    "Explorer:".bold().dimmed(),
    sig,
  );
}

/// Print a labeled key-value line.
pub fn print_field(label: &str, value: &str) {
  println!("  {:<14} {}", format!("{}:", label).bold(), value);
}

/// Format a token amount with decimals for display.
pub fn format_amount(amount: u64, decimals: u8) -> String {
  let divisor = 10u64.pow(decimals as u32);
  let whole = amount / divisor;
  let frac = amount % divisor;
  format!("{}.{:0>width$}", whole, frac, width = decimals as usize)
}
