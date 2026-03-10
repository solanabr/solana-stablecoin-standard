use std::{rc::Rc, str::FromStr};

use anchor_client::{Client, Cluster};
use anyhow::{Context, Result};
use clap::{Args, Subcommand};
use solana_sdk::{commitment_config::CommitmentConfig, pubkey::Pubkey, signer::Signer};
use solana_system_interface::program::ID as SYSTEM_PROGRAM_ID;

use crate::{
    config::CliConfig,
    pda,
    program_client::{accounts, args, event_authority, PROGRAM_ID},
};

#[derive(Subcommand)]
pub enum BlacklistCommands {
    /// Add an address to the blacklist
    Add(BlacklistAddArgs),
    /// Remove an address from the blacklist
    Remove(BlacklistRemoveArgs),
}

#[derive(Args)]
pub struct BlacklistAddArgs {
    /// Wallet address to blacklist
    pub address: String,
    /// Reason for blacklisting (required, stored on-chain, max 100 chars)
    #[arg(long, required = true)]
    pub reason: String,
}

#[derive(Args)]
pub struct BlacklistRemoveArgs {
    /// Wallet address to remove from blacklist
    pub address: String,
}

pub async fn run(cfg: CliConfig, cmd: BlacklistCommands) -> Result<()> {
    match cmd {
        BlacklistCommands::Add(a) => add(cfg, a).await,
        BlacklistCommands::Remove(a) => remove(cfg, a).await,
    }
}

async fn add(cfg: CliConfig, add_args: BlacklistAddArgs) -> Result<()> {
    if add_args.reason.len() > 100 {
        anyhow::bail!("Reason must be at most 100 characters");
    }

    let wallet = Pubkey::from_str(&add_args.address)
        .with_context(|| format!("Invalid address: {}", add_args.address))?;

    let signer = Rc::new(cfg.keypair);
    let signer_pubkey = signer.pubkey();
    let mint = cfg.mint.expect("mint required");

    let (config_pda, _) = pda::config_pda(&PROGRAM_ID, &mint);
    let (blacklisted_entry, _) = pda::blacklisted_entry_pda(&PROGRAM_ID, &mint, &wallet);

    let client = Client::new_with_options(
        Cluster::Custom(cfg.rpc_url.clone(), cfg.rpc_url),
        signer.clone(),
        CommitmentConfig::confirmed(),
    );
    let program = client.program(PROGRAM_ID)?;

    let sig = program
        .request()
        .accounts(accounts::AddToBlacklist {
            blacklister: signer_pubkey,
            mint,
            config: config_pda,
            blacklisted_entry,
            system_program: Pubkey::from_str(&SYSTEM_PROGRAM_ID.to_string())?,
            event_authority: event_authority(),
            program: PROGRAM_ID,
        })
        .args(args::AddToBlacklist {
            wallet,
            reason: add_args.reason.clone(),
        })
        .send()
        .await?;

    println!("Added {} to blacklist. Reason: {}", wallet, add_args.reason);
    println!("Tx: {}", sig);
    Ok(())
}

async fn remove(cfg: CliConfig, remove_args: BlacklistRemoveArgs) -> Result<()> {
    let wallet = Pubkey::from_str(&remove_args.address)
        .with_context(|| format!("Invalid address: {}", remove_args.address))?;

    let signer = Rc::new(cfg.keypair);
    let signer_pubkey = signer.pubkey();
    let mint = cfg.mint.expect("mint required");

    let (config_pda, _) = pda::config_pda(&PROGRAM_ID, &mint);
    let (blacklisted_entry, _) = pda::blacklisted_entry_pda(&PROGRAM_ID, &mint, &wallet);

    let client = Client::new_with_options(
        Cluster::Custom(cfg.rpc_url.clone(), cfg.rpc_url),
        signer.clone(),
        CommitmentConfig::confirmed(),
    );
    let program = client.program(PROGRAM_ID)?;

    let sig = program
        .request()
        .accounts(accounts::RemoveFromBlacklist {
            blacklister: signer_pubkey,
            mint,
            config: config_pda,
            blacklisted_entry,
            system_program: Pubkey::from_str(&SYSTEM_PROGRAM_ID.to_string())?,
            event_authority: event_authority(),
            program: PROGRAM_ID,
        })
        .args(args::RemoveFromBlacklist { wallet })
        .send()
        .await?;

    println!("Removed {} from blacklist", wallet);
    println!("Tx: {}", sig);
    Ok(())
}
