use crate::config::CliConfig;
use crate::pda::{get_allowlist_pda, get_config_pda, get_role_registry_pda, SSS_TOKEN_PROGRAM_ID};
use anchor_lang::{InstructionData, ToAccountMetas};
use anyhow::Result;
use clap::{Args, Subcommand};
use solana_sdk::{pubkey::Pubkey, signer::Signer, transaction::Transaction};

#[derive(Args)]
pub struct AllowlistArgs {
    #[command(subcommand)]
    pub action: AllowlistAction,
}

#[derive(Subcommand)]
pub enum AllowlistAction {
    Add(AllowlistAddArgs),
    Remove(AllowlistRemoveArgs),
}

#[derive(Args)]
pub struct AllowlistAddArgs {
    #[arg(long)]
    pub mint: Pubkey,
    #[arg(long)]
    pub address: Pubkey,
    #[arg(long)]
    pub token_account: Pubkey,
    #[arg(long, default_value = "")]
    pub reason: String,
}

#[derive(Args)]
pub struct AllowlistRemoveArgs {
    #[arg(long)]
    pub mint: Pubkey,
    #[arg(long)]
    pub address: Pubkey,
    #[arg(long)]
    pub token_account: Pubkey,
}

pub fn execute(config: &CliConfig, args: &AllowlistArgs) -> Result<()> {
    match &args.action {
        AllowlistAction::Add(add_args) => execute_add(config, add_args),
        AllowlistAction::Remove(remove_args) => execute_remove(config, remove_args),
    }
}

fn execute_add(config: &CliConfig, args: &AllowlistAddArgs) -> Result<()> {
    let _ = args.token_account;

    let (config_pda, _) = get_config_pda(&args.mint);
    let (role_registry_pda, _) = get_role_registry_pda(&config_pda);
    let (allowlist_entry_pda, _) = get_allowlist_pda(&config_pda, &args.address);

    let accounts = sss_token::accounts::AllowlistAdd {
        authority: config.payer.pubkey(),
        config: config_pda,
        role_registry: role_registry_pda,
        allowlist_entry: allowlist_entry_pda,
        address_to_allowlist: args.address,
        system_program: solana_sdk::pubkey!("11111111111111111111111111111111"),
    }
    .to_account_metas(None);

    let params = sss_token::instructions::AllowlistAddParams {
        reason: args.reason.clone(),
    };
    let ix_data = sss_token::instruction::AllowlistAdd { params }.data();

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
    println!("Address {} allowlisted. Signature: {}", args.address, sig);

    Ok(())
}

fn execute_remove(config: &CliConfig, args: &AllowlistRemoveArgs) -> Result<()> {
    let _ = args.token_account;

    let (config_pda, _) = get_config_pda(&args.mint);
    let (role_registry_pda, _) = get_role_registry_pda(&config_pda);
    let (allowlist_entry_pda, _) = get_allowlist_pda(&config_pda, &args.address);

    let accounts = sss_token::accounts::AllowlistRemove {
        authority: config.payer.pubkey(),
        config: config_pda,
        role_registry: role_registry_pda,
        address_to_remove: args.address,
        allowlist_entry: allowlist_entry_pda,
    }
    .to_account_metas(None);

    let ix_data = sss_token::instruction::AllowlistRemove {}.data();

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
    println!(
        "Address {} removed from allowlist. Signature: {}",
        args.address, sig
    );

    Ok(())
}
