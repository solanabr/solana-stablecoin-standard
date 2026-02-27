use anyhow::Result;
use clap::Args;
use solana_sdk::{
    pubkey::Pubkey,
    signer::Signer,
    transaction::Transaction,
};
use anchor_lang::{InstructionData, ToAccountMetas};
use crate::config::CliConfig;
use crate::pda::{get_config_pda, SSS_TOKEN_PROGRAM_ID};

#[derive(Args)]
pub struct BurnArgs {
    #[arg(long)]
    pub mint: Pubkey,
    #[arg(long)]
    pub amount: u64,
    #[arg(long)]
    pub token_account: Pubkey,
}

pub fn execute(config: &CliConfig, args: &BurnArgs) -> Result<()> {
    let (config_pda, _) = get_config_pda(&args.mint);

    let accounts = sss_token::accounts::BurnTokens {
        burner: config.payer.pubkey(),
        config: config_pda,
        mint: args.mint,
        burner_token_account: args.token_account,
        token_program: spl_token_2022_id(),
    }
    .to_account_metas(None);

    let ix_data = sss_token::instruction::BurnTokens { amount: args.amount }.data();

    let ix = solana_sdk::instruction::Instruction {
        program_id: SSS_TOKEN_PROGRAM_ID,
        accounts,
        data: ix_data,
    };

    let recent_blockhash = config.rpc_client.get_latest_blockhash()?;
    let tx = Transaction::new_signed_with_payer(
        &[ix],
        Some(&config.payer.pubkey()),
        &[&config.payer],
        recent_blockhash,
    );

    let sig = config.rpc_client.send_and_confirm_transaction(&tx)?;
    println!("Burned {} tokens. Signature: {}", args.amount, sig);

    Ok(())
}

fn spl_token_2022_id() -> Pubkey {
    solana_sdk::pubkey!("TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb")
}
