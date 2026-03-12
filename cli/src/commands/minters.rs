use crate::config::CliConfig;
use crate::pda::get_config_pda;
use anchor_lang::AccountDeserialize;
use anyhow::{Context, Result};
use clap::{Args, Subcommand};
use colored::*;
use solana_client::rpc_config::RpcProgramAccountsConfig;
use solana_client::rpc_filter::{Memcmp, RpcFilterType};
use solana_sdk::pubkey::Pubkey;
use sss_token::state::MinterInfo;

#[derive(Args)]
pub struct MintersArgs {
    #[command(subcommand)]
    pub action: MintersAction,
}

#[derive(Subcommand)]
pub enum MintersAction {
    /// List all minters for a stablecoin
    List {
        #[arg(long)]
        mint: Pubkey,
    },
}

pub fn execute(config: &CliConfig, args: &MintersArgs) -> Result<()> {
    match &args.action {
        MintersAction::List { mint } => list_minters(config, mint),
    }
}

fn list_minters(config: &CliConfig, mint: &Pubkey) -> Result<()> {
    let (config_pda, _) = get_config_pda(mint);

    let filters = vec![
        RpcFilterType::DataSize(MinterInfo::SPACE as u64),
        RpcFilterType::Memcmp(Memcmp::new_base58_encoded(
            9, // offset: 8 (discriminator) + 1 (bump)
            config_pda.as_ref(),
        )),
    ];

    let rpc_config = RpcProgramAccountsConfig {
        filters: Some(filters),
        ..Default::default()
    };

    let accounts = config
        .rpc_client
        .get_program_accounts_with_config(&crate::pda::SSS_TOKEN_PROGRAM_ID, rpc_config)
        .context("Failed to fetch minter accounts")?;

    if accounts.is_empty() {
        println!("\n  No minters found for this stablecoin.\n");
        return Ok(());
    }

    println!();
    println!("{}", "Minters".bold().underline());
    println!(
        "  {:<46} {:<8} {:<14} {:<14} {:<14}",
        "Wallet".bold(),
        "Active".bold(),
        "Quota".bold(),
        "Used".bold(),
        "Remaining".bold()
    );
    println!("  {}", "-".repeat(96));

    for (_pubkey, account) in &accounts {
        let minter = MinterInfo::try_deserialize(&mut &account.data[..]);
        if let Ok(m) = minter {
            let active = if m.is_active {
                "Yes".green().to_string()
            } else {
                "No".red().to_string()
            };
            let quota = if m.mint_quota == 0 {
                "Unlimited".to_string()
            } else {
                m.mint_quota.to_string()
            };
            let remaining = match m.remaining_quota() {
                None => "Unlimited".to_string(),
                Some(r) => r.to_string(),
            };
            println!(
                "  {:<46} {:<8} {:<14} {:<14} {:<14}",
                m.minter, active, quota, m.total_minted, remaining
            );
        }
    }
    println!();

    Ok(())
}
