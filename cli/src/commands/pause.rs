use std::rc::Rc;

use anchor_client::{Client, Cluster};
use anyhow::Result;
use solana_sdk::{commitment_config::CommitmentConfig, signer::Signer};
use spl_token_2022::ID as TOKEN_2022_PROGRAM_ID;

use crate::{
    config::CliConfig,
    pda,
    program_client::{accounts, args, event_authority, PROGRAM_ID},
};

pub async fn run(cfg: CliConfig) -> Result<()> {
    let signer = Rc::new(cfg.keypair);
    let signer_pubkey = signer.pubkey();
    let mint = cfg.mint.expect("mint required");

    let (pauser_role, _) = pda::pauser_role_pda(&PROGRAM_ID, &mint, &signer_pubkey);
    let (pause_authority, _) = pda::pause_authority_pda(&PROGRAM_ID, &mint);

    let client = Client::new_with_options(
        Cluster::Custom(cfg.rpc_url.clone(), cfg.rpc_url),
        signer.clone(),
        CommitmentConfig::confirmed(),
    );
    let program = client.program(PROGRAM_ID)?;

    let sig = program
        .request()
        .accounts(accounts::Pause {
            pauser: signer_pubkey,
            mint,
            pauser_role,
            pause_authority,
            token_program: TOKEN_2022_PROGRAM_ID,
            event_authority: event_authority(),
            program: PROGRAM_ID,
        })
        .args(args::Pause {})
        .send()
        .await?;

    println!("Mint {} paused", mint);
    println!("Tx: {}", sig);
    Ok(())
}
