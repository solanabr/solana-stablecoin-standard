use std::{rc::Rc, str::FromStr};

use anchor_client::{Client, Cluster};
use anyhow::{Context, Result};
use clap::Args;
use solana_sdk::{commitment_config::CommitmentConfig, pubkey::Pubkey, signer::Signer};
use spl_token_2022::ID as TOKEN_2022_PROGRAM_ID;

use crate::{
    config::CliConfig,
    pda,
    program_client::{accounts, args, event_authority, PROGRAM_ID},
};

#[derive(Args)]
pub struct ThawArgs {
    /// Token account (ATA) to thaw
    pub address: String,
}

pub async fn run(cfg: CliConfig, thaw_args: ThawArgs) -> Result<()> {
    let ata_to_thaw = Pubkey::from_str(&thaw_args.address)
        .with_context(|| format!("Invalid address: {}", thaw_args.address))?;

    let signer = Rc::new(cfg.keypair);
    let signer_pubkey = signer.pubkey();
    let mint = cfg.mint;

    let (master_role, _) = pda::master_role_pda(&PROGRAM_ID, &mint, &signer_pubkey);
    let (freeze_authority, _) = pda::freeze_authority_pda(&PROGRAM_ID, &mint);

    let client = Client::new_with_options(
        Cluster::Custom(cfg.rpc_url.clone(), cfg.rpc_url),
        signer.clone(),
        CommitmentConfig::confirmed(),
    );
    let program = client.program(PROGRAM_ID)?;

    let sig = program
        .request()
        .accounts(accounts::ThawAccount {
            master: signer_pubkey,
            mint,
            ata_to_thaw,
            master_role,
            freeze_authority,
            token_program: TOKEN_2022_PROGRAM_ID,
            event_authority: event_authority(),
            program: PROGRAM_ID,
        })
        .args(args::ThawAccount {})
        .send()
        .await?;

    println!("Thawed account: {}", ata_to_thaw);
    println!("Tx: {}", sig);
    Ok(())
}
