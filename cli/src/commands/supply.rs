use anyhow::{Context, Result};
use clap::Args;
use colored::*;
use solana_sdk::pubkey::Pubkey;
use anchor_lang::AccountDeserialize;
use sss_token::state::StablecoinConfig;
use crate::config::CliConfig;
use crate::pda::get_config_pda;

#[derive(Args)]
pub struct SupplyArgs {
    #[arg(long)]
    pub mint: Pubkey,
}

pub fn execute(config: &CliConfig, args: &SupplyArgs) -> Result<()> {
    let (config_pda, _) = get_config_pda(&args.mint);

    let config_data = config.rpc_client.get_account_data(&config_pda)
        .context("Failed to fetch config account")?;
    let sc = StablecoinConfig::try_deserialize(&mut &config_data[..])
        .context("Failed to deserialize StablecoinConfig")?;

    let supply = sc.current_supply();
    let divisor = 10u64.pow(sc.decimals as u32);

    let format_amount = |val: u64| -> String {
        format!("{}.{:0>width$}", val / divisor, val % divisor, width = sc.decimals as usize)
    };

    let burn_rate = if sc.total_minted > 0 {
        (sc.total_burned as f64 / sc.total_minted as f64) * 100.0
    } else {
        0.0
    };

    println!();
    println!("{}", "Supply Details".bold().underline());
    println!("  {} {}", "Total Minted:".bold(), format_amount(sc.total_minted).green());
    println!("  {} {}", "Total Burned:".bold(), format_amount(sc.total_burned).red());
    println!("  {} {}", "Current Supply:".bold(), format_amount(supply).cyan().bold());
    println!("  {} {:.2}%", "Burn Rate:".bold(), burn_rate);
    println!();

    Ok(())
}
