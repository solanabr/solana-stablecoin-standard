use crate::config::CliConfig;
use crate::pda::{get_config_pda, get_role_registry_pda};
use anchor_lang::AccountDeserialize;
use anyhow::{Context, Result};
use clap::Args;
use colored::*;
use solana_sdk::pubkey::Pubkey;
use sss_token::state::{RoleRegistry, StablecoinConfig};

#[derive(Args)]
pub struct StatusArgs {
    #[arg(long)]
    pub mint: Pubkey,
}

pub fn execute(config: &CliConfig, args: &StatusArgs) -> Result<()> {
    let (config_pda, _) = get_config_pda(&args.mint);
    let (role_registry_pda, _) = get_role_registry_pda(&config_pda);

    let config_data = config
        .rpc_client
        .get_account_data(&config_pda)
        .context("Failed to fetch config account. Is this mint initialized?")?;
    let sc = StablecoinConfig::try_deserialize(&mut &config_data[..])
        .context("Failed to deserialize StablecoinConfig")?;

    let roles_data = config
        .rpc_client
        .get_account_data(&role_registry_pda)
        .context("Failed to fetch role registry")?;
    let _roles = RoleRegistry::try_deserialize(&mut &roles_data[..])
        .context("Failed to deserialize RoleRegistry")?;

    let supply = sc.current_supply();
    let divisor = 10u64.pow(sc.decimals as u32);

    println!();
    println!("{}", "Stablecoin Status".bold().underline());
    println!("  {} {} ({})", "Name:".bold(), sc.name, sc.symbol);
    println!("  {} {}", "Mint:".bold(), sc.mint);
    println!(
        "  {} {}",
        "Paused:".bold(),
        if sc.is_paused {
            "YES".red().bold()
        } else {
            "NO".green().bold()
        }
    );
    println!(
        "  {} {}.{:0>width$}",
        "Current Supply:".bold(),
        supply / divisor,
        supply % divisor,
        width = sc.decimals as usize
    );

    let mut features = Vec::new();
    if sc.enable_permanent_delegate {
        features.push("permanent_delegate".green());
    }
    if sc.enable_transfer_hook {
        features.push("transfer_hook".green());
    }
    if sc.default_account_frozen {
        features.push("default_frozen".green());
    }
    if sc.enable_confidential_transfers {
        features.push("confidential_transfers".green());
    }
    let features_str = if features.is_empty() {
        "none".dimmed().to_string()
    } else {
        features
            .iter()
            .map(|f| f.to_string())
            .collect::<Vec<_>>()
            .join(", ")
    };
    println!("  {} {}", "Features:".bold(), features_str);
    println!(
        "  {} {}",
        "Attestations:".bold(),
        sc.reserve_attestation_index
    );
    println!("  {} {}", "Last Updated:".bold(), sc.updated_at);
    println!();

    Ok(())
}
