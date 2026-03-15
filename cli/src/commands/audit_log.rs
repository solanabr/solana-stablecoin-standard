use crate::config::CliConfig;
use crate::pda::{get_config_pda, get_reserve_attestation_pda};
use anchor_lang::AccountDeserialize;
use anyhow::{Context, Result};
use clap::Args;
use colored::*;
use serde_json::{json, Value};
use solana_client::rpc_request::RpcRequest;
use solana_sdk::pubkey::Pubkey;
use sss_token::state::{ReserveAttestation, StablecoinConfig};

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
    let action_filter = args.action.as_deref().map(ActionFilter::from_cli_arg);

    let config_data = config
        .rpc_client
        .get_account_data(&config_pda)
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
        println!(
            "  {:<6} {:<20} {:<16} {:<16} {:<46}",
            "Index".bold(),
            "Hash".bold(),
            "Reserves USD".bold(),
            "Outstanding".bold(),
            "Attested By".bold()
        );
        println!("  {}", "-".repeat(104));

        let start = if total > args.limit {
            total - args.limit
        } else {
            0
        };
        for idx in (start..total).rev() {
            let (attest_pda, _) = get_reserve_attestation_pda(&config_pda, idx);
            match config.rpc_client.get_account_data(&attest_pda) {
                Ok(data) => {
                    if let Ok(a) = ReserveAttestation::try_deserialize(&mut &data[..]) {
                        let hash_short: String = a
                            .reserve_hash
                            .iter()
                            .take(8)
                            .map(|b| format!("{:02x}", b))
                            .collect::<String>()
                            + "...";
                        println!(
                            "  {:<6} {:<20} {:<16} {:<16} {:<46}",
                            a.index,
                            hash_short,
                            format!("${:.2}", a.total_reserves_usd as f64 / 100.0),
                            a.total_outstanding,
                            a.attested_by
                        );
                    }
                }
                Err(_) => continue,
            }
        }
        println!();
    }

    // Recent transaction signatures
    println!("{}", "Recent Transactions".bold().underline());
    let sigs = config
        .rpc_client
        .get_signatures_for_address(&config_pda)
        .context("Failed to fetch transaction signatures")?;

    let display_limit = args.limit as usize;
    let signatures_to_display: Vec<_> = match &action_filter {
        Some(filter) => sigs
            .iter()
            .filter(|sig_info| transaction_matches_action(config, &sig_info.signature, filter))
            .take(display_limit)
            .collect(),
        None => sigs.iter().take(display_limit).collect(),
    };

    if signatures_to_display.is_empty() {
        match action_filter.as_ref() {
            Some(filter) => println!(
                "  No recent transactions matching action '{}'.\n",
                filter.display
            ),
            None => println!("  No recent transactions.\n"),
        }
    } else {
        println!(
            "  {:<90} {:<12} {:<10}",
            "Signature".bold(),
            "Slot".bold(),
            "Status".bold()
        );
        println!("  {}", "-".repeat(112));

        for sig_info in signatures_to_display {
            let status = if sig_info.err.is_none() {
                "OK".green().to_string()
            } else {
                "ERR".red().to_string()
            };
            println!(
                "  {:<90} {:<12} {:<10}",
                &sig_info.signature, sig_info.slot, status
            );
        }
        println!();
    }

    Ok(())
}

struct ActionFilter {
    display: String,
    log_needles: Vec<String>,
}

impl ActionFilter {
    fn from_cli_arg(action: &str) -> Self {
        let log_needles = match normalize_action_name(action).as_str() {
            "initialize" => vec!["Initialize".to_string()],
            "mint" | "minttokens" => vec!["Mint".to_string()],
            "burn" | "burntokens" => vec!["Burn".to_string()],
            "freeze" | "freezeaccount" => vec!["Freeze".to_string()],
            "thaw" | "thawaccount" => vec!["Thaw".to_string()],
            "pause" => vec!["Pause".to_string()],
            "unpause" => vec!["Unpause".to_string()],
            "updateroles" | "roleupdate" => {
                vec!["UpdateRoles".to_string(), "RoleUpdated".to_string()]
            }
            "updateminter" | "minterupdate" => {
                vec!["UpdateMinter".to_string(), "MinterUpdated".to_string()]
            }
            "transferauthority" | "authoritytransfer" => {
                vec![
                    "TransferAuthority".to_string(),
                    "AuthorityTransferred".to_string(),
                ]
            }
            "blacklistadd" => vec!["BlacklistAdd".to_string(), "BlacklistAdded".to_string()],
            "blacklistremove" => {
                vec![
                    "BlacklistRemove".to_string(),
                    "BlacklistRemoved".to_string(),
                ]
            }
            "seize" => vec!["Seize".to_string(), "Seized".to_string()],
            "reserveattestation" | "attestreserve" => {
                vec![
                    "AttestReserve".to_string(),
                    "ReserveAttestation".to_string(),
                ]
            }
            _ => vec![action.to_string()],
        };

        Self {
            display: action.to_string(),
            log_needles,
        }
    }

    fn matches_log(&self, log: &str) -> bool {
        self.log_needles.iter().any(|needle| log.contains(needle))
    }
}

fn normalize_action_name(action: &str) -> String {
    action
        .chars()
        .filter(|ch| ch.is_ascii_alphanumeric())
        .flat_map(|ch| ch.to_lowercase())
        .collect()
}

fn transaction_matches_action(config: &CliConfig, signature: &str, filter: &ActionFilter) -> bool {
    // Anchor instruction logs include the instruction name, which is sufficient for CLI filtering.
    let response = match config.rpc_client.send::<Value>(
        RpcRequest::GetTransaction,
        json!([
            signature,
            {
                "encoding": "json",
                "commitment": config.commitment.commitment,
                "maxSupportedTransactionVersion": 0
            }
        ]),
    ) {
        Ok(response) => response,
        Err(_) => return false,
    };

    response
        .get("meta")
        .and_then(|meta| meta.get("logMessages"))
        .and_then(Value::as_array)
        .map(|logs| {
            logs.iter()
                .filter_map(Value::as_str)
                .any(|log| filter.matches_log(log))
        })
        .unwrap_or(false)
}
