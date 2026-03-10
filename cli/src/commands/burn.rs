use std::rc::Rc;

use anchor_client::{Client, Cluster};
use anyhow::Result;
use clap::Args;
use solana_sdk::{commitment_config::CommitmentConfig, signer::Signer};
use spl_associated_token_account::get_associated_token_address_with_program_id;
use spl_token_2022::ID as TOKEN_2022_PROGRAM_ID;

use crate::{
    config::CliConfig,
    pda,
    program_client::{accounts, args, event_authority, PROGRAM_ID},
};

#[derive(Args)]
pub struct BurnArgs {
    /// Amount of tokens to burn (in base units)
    pub amount: u64,
}

pub async fn run(cfg: CliConfig, burn_args: BurnArgs) -> Result<()> {
    let signer = Rc::new(cfg.keypair);
    let signer_pubkey = signer.pubkey();
    let mint = cfg.mint.expect("mint required");

    let from_ata = get_associated_token_address_with_program_id(&signer_pubkey, &mint, &TOKEN_2022_PROGRAM_ID);
    let (burner_role, _) = pda::burner_role_pda(&PROGRAM_ID, &mint, &signer_pubkey);

    let client = Client::new_with_options(
        Cluster::Custom(cfg.rpc_url.clone(), cfg.rpc_url),
        signer.clone(),
        CommitmentConfig::confirmed(),
    );
    let program = client.program(PROGRAM_ID)?;

    let sig = program
        .request()
        .accounts(accounts::BurnTokens {
            burner: signer_pubkey,
            mint,
            from: from_ata,
            burner_role,
            token_program: TOKEN_2022_PROGRAM_ID,
            event_authority: event_authority(),
            program: PROGRAM_ID,
        })
        .args(args::BurnTokens { amount: burn_args.amount })
        .send()
        .await?;

    println!("Burned {} tokens from {}", burn_args.amount, from_ata);
    println!("Tx: {}", sig);
    Ok(())
}
