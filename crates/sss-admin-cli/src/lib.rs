pub mod backend;
pub mod chain;
mod cli;
pub mod config;
mod init;

pub use cli::{Cli, Command};
pub use config::{load_runtime_config, InitConfigFile, Preset, PresetDetails, ProfileConfig};

use anyhow::Result;
use clap::Parser;
use sss_domain::{LifecycleRequest, LifecycleRequestType, LifecycleStatus};
use stablecoin::instructions::roles::UpdateRolesParams;

use crate::backend::BackendClient;
use crate::chain::ChainClient;
pub fn run() -> Result<()> {
    run_with_args(std::env::args_os())
}

pub fn run_with_args<I, T>(args: I) -> Result<()>
where
    I: IntoIterator<Item = T>,
    T: Into<std::ffi::OsString> + Clone,
{
    let cli = Cli::parse_from(args);
    let Cli {
        rpc_url,
        command,
        ..
    } = cli;
    let runtime_config = load_runtime_config()?;
    let rpc_override = rpc_url.as_deref();
    let chain_client = || ChainClient::from_runtime(runtime_config.as_ref(), rpc_override);
    let backend_client = || BackendClient::from_runtime(runtime_config.as_ref());

    match command {
        Command::Init(args) => {
            let mut plan = init::prepare_init(&args, rpc_override)?;
            println!("{}", plan.render_human());
            if !args.dry_run {
                confirm_or_abort(args.yes, "Initialize stablecoin mint")?;
                let chain = ChainClient::from_runtime(Some(&plan.config), rpc_override)?;
                let execution = chain.init(&plan)?;
                println!(
                    "mint: {}\ninitialize_signature: {}\ndefault_minter_signature: {}",
                    execution.mint, execution.initialize_signature, execution.minter_signature
                );
                plan.persist_with_mint(&execution.mint.to_string())?;
            }
        }
        Command::Status(args) => {
            let chain = chain_client()?;
            let mint = parse_pubkey(&resolve_mint(args.mint, runtime_config.as_ref())?)?;
            let status = chain.get_status(mint)?;
            println!(
                concat!(
                    "mint: {}\n",
                    "preset: {}\n",
                    "name: {}\n",
                    "symbol: {}\n",
                    "decimals: {}\n",
                    "uri: {}\n",
                    "paused: {}\n",
                    "authority: {}\n",
                    "permanent_delegate: {}\n",
                    "transfer_hook: {}\n",
                    "default_account_frozen: {}\n",
                    "total_minted: {}\n",
                    "total_burned: {}\n",
                    "supply: {}\n",
                    "master_authority: {}\n",
                    "pauser: {}\n",
                    "burner: {}\n",
                    "blacklister: {}\n",
                    "seizer: {}"
                ),
                status.mint,
                infer_preset(&status),
                status.name,
                status.symbol,
                status.decimals,
                status.uri,
                status.paused,
                status.authority,
                status.enable_permanent_delegate,
                status.enable_transfer_hook,
                status.default_account_frozen,
                status.total_minted,
                status.total_burned,
                status.supply,
                status.roles.master_authority,
                status.roles.pauser,
                status.roles.burner,
                status.roles.blacklister,
                status.roles.seizer,
            );
        }
        Command::Supply(args) => {
            let chain = chain_client()?;
            let mint = parse_pubkey(&resolve_mint(args.mint, runtime_config.as_ref())?)?;
            let status = chain.get_status(mint)?;
            println!("mint: {}\nsupply: {}", mint, status.supply);
        }
        Command::Mint(args) => {
            confirm_or_abort(
                args.yes,
                &format!("Mint {} tokens to {}", args.amount, args.recipient),
            )?;
            let client = backend_client()?;
            let mint = resolve_mint(args.mint, runtime_config.as_ref())?;
            let request = client.create_mint_request(
                mint,
                args.recipient,
                parse_amount(&args.amount)?,
                args.reason,
            )?;
            print_lifecycle_request(&request);
        }
        Command::Burn(args) => {
            confirm_or_abort(args.yes, &format!("Burn {} tokens", args.amount))?;
            let client = backend_client()?;
            let mint = resolve_mint(args.mint, runtime_config.as_ref())?;
            let request = client.create_burn_request(
                mint,
                args.account,
                parse_amount(&args.amount)?,
                args.reason,
            )?;
            print_lifecycle_request(&request);
        }
        Command::Freeze(args) => {
            confirm_or_abort(args.yes, &format!("Freeze token account {}", args.address))?;
            let chain = chain_client()?;
            let mint = parse_pubkey(&resolve_mint(args.mint, runtime_config.as_ref())?)?;
            let signature = chain.freeze_account(mint, parse_pubkey(&args.address)?)?;
            println!("signature: {signature}");
        }
        Command::Thaw(args) => {
            confirm_or_abort(args.yes, &format!("Thaw token account {}", args.address))?;
            let chain = chain_client()?;
            let mint = parse_pubkey(&resolve_mint(args.mint, runtime_config.as_ref())?)?;
            let signature = chain.thaw_account(mint, parse_pubkey(&args.address)?)?;
            println!("signature: {signature}");
        }
        Command::Blacklist { command } => match command {
            cli::BlacklistCommand::Add(args) => {
                confirm_or_abort(args.yes, &format!("Blacklist wallet {}", args.address))?;
                let chain = chain_client()?;
                let mint = parse_pubkey(&resolve_mint(args.mint, runtime_config.as_ref())?)?;
                let signature = chain.add_to_blacklist(
                    mint,
                    parse_pubkey(&args.address)?,
                    args.reason,
                )?;
                println!("signature: {signature}");
            }
            cli::BlacklistCommand::Remove(args) => {
                confirm_or_abort(args.yes, &format!("Remove wallet {} from blacklist", args.address))?;
                let chain = chain_client()?;
                let mint = parse_pubkey(&resolve_mint(args.mint, runtime_config.as_ref())?)?;
                let signature = chain.remove_from_blacklist(mint, parse_pubkey(&args.address)?)?;
                println!("signature: {signature}");
            }
        }
        Command::Seize(args) => {
            confirm_or_abort(args.yes, &format!("Seize tokens from {}", args.address))?;
            let chain = chain_client()?;
            let mint = parse_pubkey(&resolve_mint(args.mint, runtime_config.as_ref())?)?;
            let signature = chain.seize(
                mint,
                parse_pubkey(&args.address)?,
                parse_pubkey(&args.to)?,
                args.amount.as_deref().map(parse_amount_u64).transpose()?,
            )?;
            println!("signature: {signature}");
        }
        Command::Pause(args) => {
            confirm_or_abort(args.yes, "Pause mint operations")?;
            let chain = chain_client()?;
            let signature = chain.pause(parse_pubkey(&resolve_mint(args.mint, runtime_config.as_ref())?)?)?;
            println!("signature: {signature}");
        }
        Command::Unpause(args) => {
            confirm_or_abort(args.yes, "Unpause mint operations")?;
            let chain = chain_client()?;
            let signature = chain.unpause(parse_pubkey(&resolve_mint(args.mint, runtime_config.as_ref())?)?)?;
            println!("signature: {signature}");
        }
        Command::Roles { command } => match command {
            cli::RolesCommand::Get(args) => {
                let chain = chain_client()?;
                let mint = parse_pubkey(&resolve_mint(args.mint, runtime_config.as_ref())?)?;
                let roles = chain.get_roles(mint)?;
                println!(
                    concat!(
                        "mint: {}\n",
                        "master_authority: {}\n",
                        "pauser: {}\n",
                        "burner: {}\n",
                        "blacklister: {}\n",
                        "seizer: {}"
                    ),
                    mint,
                    roles.master_authority,
                    roles.pauser,
                    roles.burner,
                    roles.blacklister,
                    roles.seizer,
                );
            }
            cli::RolesCommand::Set(args) => {
                if args.pauser.is_none()
                    && args.burner.is_none()
                    && args.blacklister.is_none()
                    && args.seizer.is_none()
                {
                    anyhow::bail!("roles set requires at least one role flag");
                }
                confirm_or_abort(args.yes, "Update role assignments")?;
                let chain = chain_client()?;
                let mint = parse_pubkey(&resolve_mint(args.mint, runtime_config.as_ref())?)?;
                let signature = chain.update_roles(
                    mint,
                    UpdateRolesParams {
                        pauser: args.pauser.as_deref().map(parse_pubkey).transpose()?,
                        burner: args.burner.as_deref().map(parse_pubkey).transpose()?,
                        blacklister: args.blacklister.as_deref().map(parse_pubkey).transpose()?,
                        seizer: args.seizer.as_deref().map(parse_pubkey).transpose()?,
                    },
                )?;
                println!("signature: {signature}");
            }
        },
        Command::Minters { command } => match command {
            cli::MintersCommand::List(args) => {
                let chain = chain_client()?;
                let mint = parse_pubkey(&resolve_mint(args.mint, runtime_config.as_ref())?)?;
                for minter in chain.list_minters(mint)? {
                    println!(
                        "minter: {}\nquota: {}\nminted: {}\nactive: {}\n",
                        minter.minter, minter.quota, minter.minted, minter.active
                    );
                }
            }
            cli::MintersCommand::Add(args) => {
                confirm_or_abort(args.yes, &format!("Add minter {}", args.address))?;
                let chain = chain_client()?;
                let mint = parse_pubkey(&resolve_mint(args.mint, runtime_config.as_ref())?)?;
                let signature = chain.add_minter(
                    mint,
                    parse_pubkey(&args.address)?,
                    parse_amount_u64(&args.quota)?,
                )?;
                println!("signature: {signature}");
            }
            cli::MintersCommand::Remove(args) => {
                confirm_or_abort(args.yes, &format!("Remove minter {}", args.address))?;
                let chain = chain_client()?;
                let mint = parse_pubkey(&resolve_mint(args.mint, runtime_config.as_ref())?)?;
                let signature = chain.remove_minter(mint, parse_pubkey(&args.address)?)?;
                println!("signature: {signature}");
            }
        },
        Command::Operation { command } => match command {
            cli::OperationCommand::List(args) => {
                let client = backend_client()?;
                let requests = client.list_operations(
                    args.mint.or_else(|| runtime_config.as_ref().and_then(|cfg| cfg.mint.clone())),
                    args.status.map(operation_status_name),
                    args.type_.map(operation_type_name),
                    args.limit,
                )?;
                for request in requests {
                    print_lifecycle_request(&request);
                    println!();
                }
            }
            cli::OperationCommand::Get { id } => {
                let client = backend_client()?;
                let request = client.get_operation(&id)?;
                print_lifecycle_request(&request);
            }
            cli::OperationCommand::Approve { id, approved_by } => {
                let approved_by = approved_by
                    .or_else(|| std::env::var("USER").ok())
                    .unwrap_or_else(|| "sss-token".to_string());
                let client = backend_client()?;
                let request = client.approve_operation(&id, &approved_by)?;
                print_lifecycle_request(&request);
            }
            cli::OperationCommand::Execute { id } => {
                let client = backend_client()?;
                let request = client.execute_operation(&id)?;
                print_lifecycle_request(&request);
            }
        },
        Command::Holders(args) => {
            let chain = chain_client()?;
            let mint = parse_pubkey(&resolve_mint(args.mint, runtime_config.as_ref())?)?;
            let min_balance = args.min_balance.as_deref().map(parse_amount_u64).transpose()?;
            let holders = chain.list_holders(mint, min_balance)?;
            for holder in holders.into_iter().take(args.limit.unwrap_or(100) as usize) {
                println!(
                    "owner: {}\ntoken_account: {}\nbalance: {}\n",
                    holder.owner, holder.token_account, holder.amount
                );
            }
        }
        Command::AuditLog(args) => {
            let client = backend_client()?;
            let mint = resolve_mint(args.mint, runtime_config.as_ref())?;
            let event_type = args.action.as_ref().map(|a| audit_action_name(a.clone()));
            let limit = args.limit.map(|l| l as u32);
            let mut events = client.list_mint_events(
                &mint,
                event_type.as_deref(),
                args.from.as_deref(),
                args.to.as_deref(),
                limit.or(Some(100)),
            )?;
            if let Some(wallet) = args.wallet {
                events.retain(|event| event.data.to_string().contains(&wallet));
            }
            for event in events.into_iter().take(args.limit.unwrap_or(100) as usize) {
                println!(
                    "event_type: {}\nslot: {}\ntx_signature: {}\ndata: {}\n",
                    event.event_type, event.slot, event.tx_signature, event.data
                );
            }
        }
    }

    Ok(())
}

fn resolve_mint(cli_mint: Option<String>, runtime_config: Option<&InitConfigFile>) -> Result<String> {
    cli_mint
        .or_else(|| runtime_config.and_then(|cfg| cfg.mint.clone()))
        .or_else(|| std::env::var("SSS_MINT").ok())
        .ok_or_else(|| anyhow::anyhow!("mint must be provided via --mint, config.mint, or SSS_MINT"))
}

fn parse_amount(value: &str) -> Result<i128> {
    value
        .parse::<i128>()
        .map_err(|error| anyhow::anyhow!("invalid amount {value}: {error}"))
}

fn parse_amount_u64(value: &str) -> Result<u64> {
    value
        .parse::<u64>()
        .map_err(|error| anyhow::anyhow!("invalid amount {value}: {error}"))
}

fn parse_pubkey(value: &str) -> Result<solana_sdk::pubkey::Pubkey> {
    value
        .parse()
        .map_err(|error| anyhow::anyhow!("invalid pubkey {value}: {error}"))
}

fn confirm_or_abort(skip: bool, summary: &str) -> Result<()> {
    if skip {
        return Ok(());
    }
    println!("Confirm action: {summary}");
    println!("Type 'yes' to continue:");
    let mut input = String::new();
    std::io::stdin().read_line(&mut input)?;
    if input.trim() != "yes" {
        anyhow::bail!("aborted by operator");
    }
    Ok(())
}

fn print_lifecycle_request(request: &LifecycleRequest) {
    println!(
        concat!(
            "request_id: {}\n",
            "type: {}\n",
            "status: {}\n",
            "mint: {}\n",
            "amount: {}\n",
            "recipient: {}\n",
            "token_account: {}\n",
            "requested_by: {}\n",
            "approved_by: {}\n",
            "tx_signature: {}"
        ),
        request.id,
        request.type_.as_str(),
        request.status.as_str(),
        request.mint,
        request.amount,
        display_or_dash(&request.recipient),
        display_or_dash(&request.token_account),
        request.requested_by,
        request.approved_by.as_deref().unwrap_or("-"),
        request.tx_signature.as_deref().unwrap_or("-"),
    );
}

fn display_or_dash(value: &str) -> &str {
    if value.trim().is_empty() {
        "-"
    } else {
        value
    }
}

fn audit_action_name(action: cli::AuditAction) -> String {
    match action {
        cli::AuditAction::Mint => "TokensMinted",
        cli::AuditAction::Burn => "TokensBurned",
        cli::AuditAction::Freeze => "AccountFrozen",
        cli::AuditAction::Thaw => "AccountThawed",
        cli::AuditAction::Pause => "PauseChanged",
        cli::AuditAction::Unpause => "PauseChanged",
        cli::AuditAction::BlacklistAdd => "AddressBlacklisted",
        cli::AuditAction::BlacklistRemove => "AddressUnblacklisted",
        cli::AuditAction::Seize => "TokensSeized",
    }
    .to_string()
}

fn operation_status_name(status: cli::OperationStatus) -> LifecycleStatus {
    match status {
        cli::OperationStatus::Requested => LifecycleStatus::Requested,
        cli::OperationStatus::Approved => LifecycleStatus::Approved,
        cli::OperationStatus::Signing => LifecycleStatus::Signing,
        cli::OperationStatus::Submitted => LifecycleStatus::Submitted,
        cli::OperationStatus::Finalized => LifecycleStatus::Finalized,
        cli::OperationStatus::Failed => LifecycleStatus::Failed,
        cli::OperationStatus::Cancelled => LifecycleStatus::Cancelled,
    }
}

fn operation_type_name(type_: cli::OperationType) -> LifecycleRequestType {
    match type_ {
        cli::OperationType::Mint => LifecycleRequestType::Mint,
        cli::OperationType::Burn => LifecycleRequestType::Burn,
    }
}

fn infer_preset(status: &crate::chain::StatusRecord) -> &'static str {
    if status.enable_permanent_delegate && status.enable_transfer_hook {
        "sss-2"
    } else {
        "sss-1"
    }
}
