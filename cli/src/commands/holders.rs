use anyhow::{Context, Result};
use clap::Args;
use colored::*;
use solana_sdk::pubkey::Pubkey;
use crate::config::CliConfig;

#[derive(Args)]
pub struct HoldersArgs {
    #[arg(long)]
    pub mint: Pubkey,
    #[arg(long, default_value_t = 0)]
    pub min_balance: u64,
}

pub fn execute(config: &CliConfig, args: &HoldersArgs) -> Result<()> {
    let accounts = config.rpc_client
        .get_token_largest_accounts(&args.mint)
        .context("Failed to fetch token holders")?;

    let filtered: Vec<_> = accounts.iter()
        .filter(|a| {
            let amount: u64 = a.amount.amount.parse().unwrap_or(0);
            amount >= args.min_balance
        })
        .collect();

    if filtered.is_empty() {
        println!("\n  No holders found.\n");
        return Ok(());
    }

    println!();
    println!("{}", "Token Holders".bold().underline());
    println!("  {:<46} {:<20}", "Address".bold(), "Balance".bold());
    println!("  {}", "-".repeat(66));

    for account in &filtered {
        let display_amount = account.amount.ui_amount
            .map(|a| format!("{:.6}", a))
            .unwrap_or_else(|| account.amount.amount.clone());
        println!("  {:<46} {:<20}", account.address, display_amount);
    }
    println!();

    Ok(())
}
