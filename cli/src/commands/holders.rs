use anyhow::Result;
use clap::Args;
use solana_client::{
    rpc_client::RpcClient,
    rpc_config::{RpcAccountInfoConfig, RpcProgramAccountsConfig},
    rpc_filter::{Memcmp, RpcFilterType},
};
use anchor_client::solana_account_decoder::UiAccountEncoding;
use solana_sdk::commitment_config::CommitmentConfig;
use spl_token_2022::{state::Account as TokenAccount, ID as TOKEN_2022_PROGRAM_ID};
use anchor_lang::solana_program::program_pack::Pack;

use crate::config::CliConfig;

#[derive(Args)]
pub struct HoldersArgs {
    /// Minimum balance to include (in base units, default: 1)
    #[arg(long, default_value_t = 1)]
    pub min_balance: u64,
}

pub async fn run(cfg: CliConfig, holders_args: HoldersArgs) -> Result<()> {
    let rpc = RpcClient::new_with_commitment(cfg.rpc_url.clone(), CommitmentConfig::confirmed());

    // Filter token accounts by mint (mint pubkey is at offset 0 in token account data)
    let accounts = rpc.get_program_accounts_with_config(
        &TOKEN_2022_PROGRAM_ID,
        RpcProgramAccountsConfig {
            sort_results: None,
            filters: Some(vec![
                // Token accounts are at least 165 bytes
                RpcFilterType::DataSize(165),
                // Mint at offset 0
                RpcFilterType::Memcmp(Memcmp::new_base58_encoded(0, &cfg.mint.to_bytes())),
            ]),
            account_config: RpcAccountInfoConfig {
                encoding: Some(UiAccountEncoding::Base64),
                commitment: Some(CommitmentConfig::confirmed()),
                ..Default::default()
            },
            with_context: None,
        },
    )?;

    let mut found = 0usize;
    for (pubkey, account) in &accounts {
        if let Ok(token_acc) = TokenAccount::unpack(&account.data[..165]) {
            if token_acc.amount >= holders_args.min_balance {
                println!(
                    "  {} | owner: {} | balance: {}",
                    pubkey, token_acc.owner, token_acc.amount
                );
                found += 1;
            }
        }
    }

    if found == 0 {
        println!("No holders found with balance >= {}", holders_args.min_balance);
    } else {
        println!("\nTotal: {} holder(s)", found);
    }

    Ok(())
}
