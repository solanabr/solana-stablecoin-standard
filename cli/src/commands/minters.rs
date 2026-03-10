use std::{rc::Rc, str::FromStr};

use anchor_client::{Client, Cluster};
use anyhow::{Context, Result};
use clap::{Args, Subcommand};
use solana_client::rpc_client::RpcClient;
use solana_client::rpc_config::{RpcAccountInfoConfig, RpcProgramAccountsConfig};
use solana_client::rpc_filter::{Memcmp, MemcmpEncodedBytes, RpcFilterType};
use solana_sdk::{
    commitment_config::CommitmentConfig, pubkey::Pubkey, signer::Signer,
};
use solana_system_interface::program::ID as SYSTEM_PROGRAM_ID;

use anchor_lang::{AccountDeserialize, Discriminator};
use base64::Engine;

use crate::{
    config::CliConfig,
    pda,
    program_client::{accounts, args, event_authority, sss, PROGRAM_ID},
};

#[derive(Subcommand)]
pub enum MintersCommands {
    /// List all minters for this mint
    List,
    /// Add a new minter with an allowance
    Add(MinterAddArgs),
    /// Remove an existing minter
    Remove(MinterRemoveArgs),
}

#[derive(Args)]
pub struct MinterAddArgs {
    /// Minter wallet address to add
    pub address: String,
    /// Minting allowance (in base units)
    #[arg(default_value_t = 1_000_000_000_000)]
    pub allowance: u64,
}

#[derive(Args)]
pub struct MinterRemoveArgs {
    /// Minter wallet address to remove
    pub address: String,
}

pub async fn run(cfg: CliConfig, cmd: MintersCommands) -> Result<()> {
    match cmd {
        MintersCommands::List => list(cfg).await,
        MintersCommands::Add(a) => add(cfg, a).await,
        MintersCommands::Remove(a) => remove(cfg, a).await,
    }
}

async fn list(cfg: CliConfig) -> Result<()> {
    let mint = cfg.mint.expect("mint required");
    let rpc = RpcClient::new_with_commitment(cfg.rpc_url.clone(), CommitmentConfig::confirmed());

    // MinterAccount discriminator (8 bytes). Use Base64 so RPC compares account[0..8]; some nodes
    // (e.g. Surfpool) only match when bytes are sent as Base64, not raw Bytes.
    let discriminator = sss::accounts::MinterAccount::DISCRIMINATOR;
    let disc_b64 = base64::engine::general_purpose::STANDARD.encode(discriminator);
    // Mint is at offset 8 (disc) + 1 (bump) + 8 (allowance) + 8 (minted) = 25. Filter by mint so we
    // only list minters for this mint (not all minters across all mints).
    const MINT_OFFSET: usize = 8 + 1 + 8 + 8;
    let mint_b64 = base64::engine::general_purpose::STANDARD.encode(mint.to_bytes());

    let accounts_raw = rpc.get_program_accounts_with_config(
        &PROGRAM_ID,
        RpcProgramAccountsConfig {
            filters: Some(vec![
                RpcFilterType::Memcmp(Memcmp::new(
                    0,
                    MemcmpEncodedBytes::Base64(disc_b64),
                )),
                RpcFilterType::Memcmp(Memcmp::new(
                    MINT_OFFSET,
                    MemcmpEncodedBytes::Base64(mint_b64),
                )),
            ]),
            account_config: RpcAccountInfoConfig {
                encoding: Some(anchor_client::solana_account_decoder::UiAccountEncoding::Base64),
                commitment: Some(CommitmentConfig::confirmed()),
                ..Default::default()
            },
            ..Default::default()
        },
    )?;

    if accounts_raw.is_empty() {
        println!("No minters found for mint {}", mint);
        return Ok(());
    }

    println!("Minters for mint {}:", mint);
    for (pubkey, account) in &accounts_raw {
        if let Ok(minter) = sss::accounts::MinterAccount::try_deserialize(&mut account.data.as_slice()) {
            println!(
                "  PDA: {}  allowance: {}  minted: {}",
                pubkey, minter.allowance, minter.minted
            );
        }
    }
    Ok(())
}

async fn add(cfg: CliConfig, add_args: MinterAddArgs) -> Result<()> {
    let minter_wallet = Pubkey::from_str(&add_args.address)
        .with_context(|| format!("Invalid address: {}", add_args.address))?;

    let signer = Rc::new(cfg.keypair);
    let signer_pubkey = signer.pubkey();
    let mint = cfg.mint.expect("mint required");

    let (master_role, _) = pda::master_role_pda(&PROGRAM_ID, &mint, &signer_pubkey);
    let (update_minter_pda, _) = pda::minter_account_pda(&PROGRAM_ID, &mint, &minter_wallet);

    let client = Client::new_with_options(
        Cluster::Custom(cfg.rpc_url.clone(), cfg.rpc_url),
        signer.clone(),
        CommitmentConfig::confirmed(),
    );
    let program = client.program(PROGRAM_ID)?;

    let sig = program
        .request()
        .accounts(accounts::UpdateMinter {
            master: signer_pubkey,
            mint,
            master_role,
            update_minter: update_minter_pda,
            system_program: Pubkey::from_str(&SYSTEM_PROGRAM_ID.to_string())?,
            event_authority: event_authority(),
            program: PROGRAM_ID,
        })
        .args(args::UpdateMinter {
            operation: "add".to_string(),
            minter: minter_wallet,
            allowance: add_args.allowance,
        })
        .send()
        .await?;

    println!("Added minter {} with allowance {}", minter_wallet, add_args.allowance);
    println!("Tx: {}", sig);
    Ok(())
}

async fn remove(cfg: CliConfig, remove_args: MinterRemoveArgs) -> Result<()> {
    let minter_wallet = Pubkey::from_str(&remove_args.address)
        .with_context(|| format!("Invalid address: {}", remove_args.address))?;

    let signer = Rc::new(cfg.keypair);
    let signer_pubkey = signer.pubkey();
    let mint = cfg.mint.expect("mint required");

    let (master_role, _) = pda::master_role_pda(&PROGRAM_ID, &mint, &signer_pubkey);
    let (update_minter_pda, _) = pda::minter_account_pda(&PROGRAM_ID, &mint, &minter_wallet);

    let client = Client::new_with_options(
        Cluster::Custom(cfg.rpc_url.clone(), cfg.rpc_url),
        signer.clone(),
        CommitmentConfig::confirmed(),
    );
    let program = client.program(PROGRAM_ID)?;

    let sig = program
        .request()
        .accounts(accounts::UpdateMinter {
            master: signer_pubkey,
            mint,
            master_role,
            update_minter: update_minter_pda,
            system_program: Pubkey::from_str(&SYSTEM_PROGRAM_ID.to_string())?,
            event_authority: event_authority(),
            program: PROGRAM_ID,
        })
        .args(args::UpdateMinter {
            operation: "remove".to_string(),
            minter: minter_wallet,
            allowance: 0,
        })
        .send()
        .await?;

    println!("Removed minter {}", minter_wallet);
    println!("Tx: {}", sig);
    Ok(())
}
