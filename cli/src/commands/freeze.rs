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
pub struct FreezeArgs {
    /// Token account (ATA) to freeze
    pub address: String,
}

pub async fn run(cfg: CliConfig, freeze_args: FreezeArgs) -> Result<()> {
    let ata_to_freeze = Pubkey::from_str(&freeze_args.address)
        .with_context(|| format!("Invalid address: {}", freeze_args.address))?;

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
        .accounts(accounts::FreezeAccount {
            master: signer_pubkey,
            mint,
            ata_to_freeze,
            master_role,
            freeze_authority,
            token_program: TOKEN_2022_PROGRAM_ID,
            event_authority: event_authority(),
            program: PROGRAM_ID,
        })
        .args(args::FreezeAccount {})
        .send()
        .await?;

    println!("Froze account: {}", ata_to_freeze);
    println!("Tx: {}", sig);
    Ok(())
}
