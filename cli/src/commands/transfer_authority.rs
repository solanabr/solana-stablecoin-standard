use std::{rc::Rc, str::FromStr};

use anchor_client::{Client, Cluster};
use anyhow::{Context, Result};
use clap::Args;
use solana_sdk::{commitment_config::CommitmentConfig, pubkey::Pubkey, signer::Signer};
use solana_system_interface::program::ID as SYSTEM_PROGRAM_ID;

use crate::{
    config::CliConfig,
    pda,
    program_client::{accounts, args, event_authority, PROGRAM_ID},
};

#[derive(Args)]
pub struct TransferAuthorityArgs {
    /// New master authority address
    pub new_master: String,
}

pub async fn run(cfg: CliConfig, ta: TransferAuthorityArgs) -> Result<()> {
    let new_master = Pubkey::from_str(&ta.new_master)
        .with_context(|| format!("Invalid new_master: {}", ta.new_master))?;

    let signer = Rc::new(cfg.keypair);
    let signer_pubkey = signer.pubkey();
    let mint = cfg.mint;

    let (master_role, _) = pda::master_role_pda(&PROGRAM_ID, &mint, &signer_pubkey);
    let (new_master_role, _) = pda::master_role_pda(&PROGRAM_ID, &mint, &new_master);

    let client = Client::new_with_options(
        Cluster::Custom(cfg.rpc_url.clone(), cfg.rpc_url),
        signer.clone(),
        CommitmentConfig::confirmed(),
    );
    let program = client.program(PROGRAM_ID)?;

    let sig = program
        .request()
        .accounts(accounts::TransferAuthority {
            master: signer_pubkey,
            mint,
            master_role,
            new_master_role,
            system_program: Pubkey::from_str(&SYSTEM_PROGRAM_ID.to_string())?,
            event_authority: event_authority(),
            program: PROGRAM_ID,
        })
        .args(args::TransferAuthority { new_master })
        .send()
        .await?;

    println!("Transferred master authority to {}", new_master);
    println!("Tx: {}", sig);
    Ok(())
}
