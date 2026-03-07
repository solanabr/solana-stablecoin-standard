use std::{rc::Rc, str::FromStr};

use anchor_client::{Client, Cluster};
use anyhow::{Context, Result};
use clap::Args;
use solana_client::rpc_client::RpcClient;
use solana_sdk::{
    commitment_config::CommitmentConfig, pubkey::Pubkey, signer::Signer,
};
use spl_associated_token_account::{
    get_associated_token_address_with_program_id,
    instruction::create_associated_token_account_idempotent,
};
use spl_token_2022::ID as TOKEN_2022_PROGRAM_ID;

use crate::{
    config::CliConfig,
    pda,
    program_client::{accounts, args, event_authority, PROGRAM_ID},
};

#[derive(Args)]
pub struct MintArgs {
    /// Recipient wallet address
    pub recipient: String,
    /// Amount of tokens to mint (in base units)
    pub amount: u64,
}

pub async fn run(cfg: CliConfig, mint_args: MintArgs) -> Result<()> {
    let recipient = Pubkey::from_str(&mint_args.recipient)
        .with_context(|| format!("Invalid recipient pubkey: {}", mint_args.recipient))?;

    let signer = Rc::new(cfg.keypair);
    let signer_pubkey = signer.pubkey();
    let mint = cfg.mint;

    let (minter_account, _) = pda::minter_account_pda(&PROGRAM_ID, &mint, &signer_pubkey);
    let (mint_authority, _) = pda::mint_authority_pda(&PROGRAM_ID, &mint);

    let to_ata = get_associated_token_address_with_program_id(&recipient, &mint, &TOKEN_2022_PROGRAM_ID);

    // Create ATA for recipient if it doesn't exist
    let rpc = RpcClient::new_with_commitment(cfg.rpc_url.clone(), CommitmentConfig::confirmed());
    let create_ata_ix = create_associated_token_account_idempotent(
        &signer_pubkey,
        &recipient,
        &mint,
        &TOKEN_2022_PROGRAM_ID,
    );

    let client = Client::new_with_options(
        Cluster::Custom(cfg.rpc_url.clone(), cfg.rpc_url),
        signer.clone(),
        CommitmentConfig::confirmed(),
    );
    let program = client.program(PROGRAM_ID)?;

    let sig = program
        .request()
        .instruction(create_ata_ix)
        .accounts(accounts::MintTokens {
            minter: signer_pubkey,
            mint,
            to: to_ata,
            minter_account,
            mint_authority,
            token_program: TOKEN_2022_PROGRAM_ID,
            event_authority: event_authority(),
            program: PROGRAM_ID,
        })
        .args(args::MintTokens { amount: mint_args.amount })
        .send()
        .await?;

    println!("Minted {} tokens to {} (ATA: {})", mint_args.amount, recipient, to_ata);
    println!("Tx: {}", sig);
    drop(rpc);
    Ok(())
}
