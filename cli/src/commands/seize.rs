use anyhow::Result;
use clap::Args;
use solana_sdk::{
    pubkey::Pubkey,
    signer::Signer,
    transaction::Transaction,
};
use anchor_lang::{InstructionData, ToAccountMetas};
use crate::config::CliConfig;
use crate::pda::{get_config_pda, get_role_registry_pda, get_blacklist_pda, SSS_TOKEN_PROGRAM_ID};

#[derive(Args)]
pub struct SeizeArgs {
    #[arg(long)]
    pub mint: Pubkey,
    #[arg(long)]
    pub from: Pubkey,
    #[arg(long)]
    pub to: Pubkey,
    #[arg(long)]
    pub amount: u64,
    #[arg(long, help = "The blacklisted wallet address (owner of --from)")]
    pub blacklisted_address: Pubkey,
}

pub fn execute(config: &CliConfig, args: &SeizeArgs) -> Result<()> {
    let (config_pda, _) = get_config_pda(&args.mint);
    let (role_registry_pda, _) = get_role_registry_pda(&config_pda);
    let (blacklist_entry_pda, _) = get_blacklist_pda(&config_pda, &args.blacklisted_address);

    let accounts = sss_token::accounts::Seize {
        authority: config.payer.pubkey(),
        config: config_pda,
        role_registry: role_registry_pda,
        blacklist_entry: blacklist_entry_pda,
        mint: args.mint,
        from_token_account: args.from,
        to_token_account: args.to,
        token_program: spl_token_2022_id(),
    }
    .to_account_metas(None);

    let ix_data = sss_token::instruction::Seize { amount: args.amount }.data();

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
    println!("Seized {} tokens. Signature: {}", args.amount, sig);

    Ok(())
}

fn spl_token_2022_id() -> Pubkey {
    solana_sdk::pubkey!("TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb")
}
