use std::{rc::Rc, str::FromStr};

use anchor_client::{Client, Cluster};
use anyhow::{Context, Result};
use clap::Args;
use solana_client::rpc_client::RpcClient;
use solana_sdk::{commitment_config::CommitmentConfig, program_pack::Pack, pubkey::Pubkey, signer::Signer};
use spl_associated_token_account::{
    get_associated_token_address_with_program_id,
    instruction::create_associated_token_account_idempotent,
};
use spl_token_2022::{
    state::Account as TokenAccount,
    ID as TOKEN_2022_PROGRAM_ID,
};

use crate::{
    config::CliConfig,
    pda,
    program_client::{accounts, args, event_authority, PROGRAM_ID},
};

#[derive(Args)]
pub struct SeizeArgs {
    /// Token account (ATA) to seize from
    pub from_address: String,
    /// Amount of tokens to seize (seizes all if not specified)
    pub amount: Option<u64>,
    /// Treasury token account (or wallet) to send seized tokens to
    #[arg(long, required = true)]
    pub to: String,
}

pub async fn run(cfg: CliConfig, seize_args: SeizeArgs) -> Result<()> {
    let from_ata = Pubkey::from_str(&seize_args.from_address)
        .with_context(|| format!("Invalid from address: {}", seize_args.from_address))?;
    let to_wallet = Pubkey::from_str(&seize_args.to)
        .with_context(|| format!("Invalid --to address: {}", seize_args.to))?;

    let signer = Rc::new(cfg.keypair);
    let signer_pubkey = signer.pubkey();
    let mint = cfg.mint.expect("mint required");

    let rpc = RpcClient::new_with_commitment(cfg.rpc_url.clone(), CommitmentConfig::confirmed());

    let amount = match seize_args.amount {
        Some(a) => a,
        None => {
            let raw = rpc.get_account_data(&from_ata)?;
            // Token-2022 accounts can have extensions after the base 165 bytes; unpack only the base layout
            let base_len = spl_token_2022::state::Account::LEN;
            let slice = raw
                .get(..base_len)
                .with_context(|| "Token account data too small")?;
            let token_acc = TokenAccount::unpack(slice)
                .context("Failed to deserialize source token account")?;
            token_acc.amount
        }
    };

    let to_ata = get_associated_token_address_with_program_id(&to_wallet, &mint, &TOKEN_2022_PROGRAM_ID);
    let create_ata_ix = create_associated_token_account_idempotent(
        &signer_pubkey,
        &to_wallet,
        &mint,
        &TOKEN_2022_PROGRAM_ID,
    );

    let (seizer_authority, _) = pda::seizer_authority_pda(&PROGRAM_ID, &mint);
    let (seizer_role, _) = pda::seizer_role_pda(&PROGRAM_ID, &mint, &signer_pubkey);
    let (stablecoin_config, _) = pda::config_pda(&PROGRAM_ID, &mint);

    let client = Client::new_with_options(
        Cluster::Custom(cfg.rpc_url.clone(), cfg.rpc_url),
        signer.clone(),
        CommitmentConfig::confirmed(),
    );
    let program = client.program(PROGRAM_ID)?;

    let sig = program
        .request()
        .instruction(create_ata_ix)
        .accounts(accounts::Seize {
            seizer: signer_pubkey,
            seizer_authority,
            seizer_role,
            stablecoin_config,
            from: from_ata,
            to: to_ata,
            mint,
            token_program: TOKEN_2022_PROGRAM_ID,
            event_authority: event_authority(),
            program: PROGRAM_ID,
        })
        .args(args::Seize { amount })
        .send()
        .await?;

    println!("Seized {} tokens from {} to {}", amount, from_ata, to_ata);
    println!("Tx: {}", sig);
    Ok(())
}
