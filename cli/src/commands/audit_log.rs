use anyhow::{Context, Result};
use clap::Args;
use colored::*;
use solana_sdk::pubkey::Pubkey;
use anchor_lang::AccountDeserialize;
use sss_token::state::{StablecoinConfig, ReserveAttestation};
use crate::config::CliConfig;
use crate::pda::{get_config_pda, get_reserve_attestation_pda};

#[derive(Args)]
pub struct AuditLogArgs {
    #[arg(long)]
    pub mint: Pubkey,
    #[arg(long, help = "Filter by action type")]
    pub action: Option<String>,
    #[arg(long, default_value_t = 20)]
    pub limit: u64,
}

pub fn execute(config: &CliConfig, args: &AuditLogArgs) -> Result<()> {
    let (config_pda, _) = get_config_pda(&args.mint);

    let config_data = config.rpc_client.get_account_data(&config_pda)
        .context("Failed to fetch config account")?;
    let sc = StablecoinConfig::try_deserialize(&mut &config_data[..])
        .context("Failed to deserialize StablecoinConfig")?;

    // Display attestations in reverse chronological order
    let total = sc.reserve_attestation_index;
    if total == 0 {
        println!("\n  No attestations recorded.\n");
    } else {
        println!();
        println!("{}", "Reserve Attestations".bold().underline());
        println!("  {:<6} {:<20} {:<16} {:<16} {:<46}",
            "Index".bold(), "Hash".bold(), "Reserves USD".bold(),
            "Outstanding".bold(), "Attested By".bold());
        println!("  {}", "-".repeat(104));

        let start = if total > args.limit { total - args.limit } else { 0 };
        for idx in (start..total).rev() {
            let (attest_pda, _) = get_reserve_attestation_pda(&config_pda, idx);
            match config.rpc_client.get_account_data(&attest_pda) {
                Ok(data) => {
                    if let Ok(a) = ReserveAttestation::try_deserialize(&mut &data[..]) {
                        let hash_short: String = a.reserve_hash.iter()
                            .take(8)
                            .map(|b| format!("{:02x}", b))
                            .collect::<String>() + "...";
                        println!("  {:<6} {:<20} {:<16} {:<16} {:<46}",
                            a.index, hash_short,
                            format!("${:.2}", a.total_reserves_usd as f64 / 100.0),
                            a.total_outstanding, a.attested_by);
                    }
                }
                Err(_) => continue,
            }
        }
        println!();
    }

    // Recent transaction signatures
    println!("{}", "Recent Transactions".bold().underline());
    let sigs = config.rpc_client
        .get_signatures_for_address(&config_pda)
        .context("Failed to fetch transaction signatures")?;

    let display_limit = args.limit.min(sigs.len() as u64) as usize;
    if sigs.is_empty() {
        println!("  No recent transactions.\n");
    } else {
        println!("  {:<90} {:<12} {:<10}",
            "Signature".bold(), "Slot".bold(), "Status".bold());
        println!("  {}", "-".repeat(112));

        for sig_info in sigs.iter().take(display_limit) {
            let status = if sig_info.err.is_none() {
                "OK".green().to_string()
            } else {
                "ERR".red().to_string()
            };
            println!("  {:<90} {:<12} {:<10}",
                &sig_info.signature, sig_info.slot, status);
        }
        println!();
    }

    Ok(())
}
