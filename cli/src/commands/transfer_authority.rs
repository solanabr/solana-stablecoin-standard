use crate::config::CliConfig;
use crate::pda::{get_config_pda, get_role_registry_pda, SSS_TOKEN_PROGRAM_ID};
use anchor_lang::{InstructionData, ToAccountMetas};
use anyhow::{Context, Result};
use clap::Args;
use solana_sdk::{
    pubkey::Pubkey,
    signature::read_keypair_file,
    signer::Signer,
    transaction::Transaction,
};
use std::io::{self, Write};

#[derive(Args)]
pub struct TransferAuthorityArgs {
    #[arg(long)]
    pub mint: Pubkey,
    #[arg(long, help = "Path to the new authority's keypair file")]
    pub new_authority: String,
    #[arg(long, help = "Skip confirmation prompt", default_value_t = false)]
    pub yes: bool,
}

pub fn execute(config: &CliConfig, args: &TransferAuthorityArgs) -> Result<()> {
    let new_authority_keypair = read_keypair_file(&args.new_authority).map_err(|e| {
        anyhow::anyhow!(
            "Failed to read new authority keypair from {}: {}",
            args.new_authority,
            e
        )
    })?;

    let new_authority_pubkey = new_authority_keypair.pubkey();

    if !args.yes {
        println!("WARNING: You are about to transfer master authority.");
        println!("  Mint:            {}", args.mint);
        println!("  Current authority: {}", config.payer.pubkey());
        println!("  New authority:     {}", new_authority_pubkey);
        println!();
        print!("This action is irreversible. Continue? [y/N] ");
        io::stdout().flush().context("Failed to flush stdout")?;

        let mut input = String::new();
        io::stdin()
            .read_line(&mut input)
            .context("Failed to read input")?;

        if !matches!(input.trim().to_lowercase().as_str(), "y" | "yes") {
            println!("Aborted.");
            return Ok(());
        }
    }

    let (config_pda, _) = get_config_pda(&args.mint);
    let (role_registry_pda, _) = get_role_registry_pda(&config_pda);

    let accounts = sss_token::accounts::TransferAuthority {
        authority: config.payer.pubkey(),
        config: config_pda,
        role_registry: role_registry_pda,
        new_authority: new_authority_pubkey,
    }
    .to_account_metas(None);

    let ix_data = sss_token::instruction::TransferAuthority {}.data();

    let ix = solana_sdk::instruction::Instruction {
        program_id: SSS_TOKEN_PROGRAM_ID,
        accounts,
        data: ix_data,
    };

    let recent_blockhash = config.rpc_client.get_latest_blockhash()?;
    let tx = Transaction::new_signed_with_payer(
        &[ix],
        Some(&config.payer.pubkey()),
        &[&config.payer, &new_authority_keypair],
        recent_blockhash,
    );

    let sig = config.rpc_client.send_and_confirm_transaction(&tx)?;
    println!(
        "Authority transferred to {}. Signature: {}",
        new_authority_pubkey, sig
    );

    Ok(())
}
