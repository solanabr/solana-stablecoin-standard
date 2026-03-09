use anyhow::Result;
use clap::{Args, Subcommand};
use solana_sdk::{
    pubkey::Pubkey,
    signer::Signer,
    transaction::Transaction,
};
use anchor_lang::{InstructionData, ToAccountMetas};
use crate::config::CliConfig;
use crate::pda::{get_config_pda, get_role_registry_pda, get_blacklist_pda, SSS_TOKEN_PROGRAM_ID};

#[derive(Args)]
pub struct BlacklistArgs {
    #[command(subcommand)]
    pub action: BlacklistAction,
}

#[derive(Subcommand)]
pub enum BlacklistAction {
    Add(BlacklistAddArgs),
    Remove(BlacklistRemoveArgs),
}

#[derive(Args)]
pub struct BlacklistAddArgs {
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
pub struct BlacklistRemoveArgs {
    #[arg(long)]
    pub mint: Pubkey,
    #[arg(long)]
    pub address: Pubkey,
    #[arg(long)]
    pub token_account: Pubkey,
}

pub fn execute(config: &CliConfig, args: &BlacklistArgs) -> Result<()> {
    match &args.action {
        BlacklistAction::Add(add_args) => execute_add(config, add_args),
        BlacklistAction::Remove(remove_args) => execute_remove(config, remove_args),
    }
}

fn execute_add(config: &CliConfig, args: &BlacklistAddArgs) -> Result<()> {
    let (config_pda, _) = get_config_pda(&args.mint);
    let (role_registry_pda, _) = get_role_registry_pda(&config_pda);
    let (blacklist_entry_pda, _) = get_blacklist_pda(&config_pda, &args.address);

    let accounts = sss_token::accounts::BlacklistAdd {
        authority: config.payer.pubkey(),
        config: config_pda,
        role_registry: role_registry_pda,
        blacklist_entry: blacklist_entry_pda,
        address_to_blacklist: args.address,
        mint: args.mint,
        target_token_account: args.token_account,
        token_program: spl_token_2022_id(),
        system_program: solana_sdk::pubkey!("11111111111111111111111111111111"),
    }
    .to_account_metas(None);

    let params = sss_token::instructions::BlacklistAddParams {
        reason: args.reason.clone(),
    };
    let ix_data = sss_token::instruction::BlacklistAdd { params }.data();

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
    println!("Address {} blacklisted. Signature: {}", args.address, sig);

    Ok(())
}

fn execute_remove(config: &CliConfig, args: &BlacklistRemoveArgs) -> Result<()> {
    let (config_pda, _) = get_config_pda(&args.mint);
    let (role_registry_pda, _) = get_role_registry_pda(&config_pda);
    let (blacklist_entry_pda, _) = get_blacklist_pda(&config_pda, &args.address);

    let accounts = sss_token::accounts::BlacklistRemove {
        authority: config.payer.pubkey(),
        config: config_pda,
        role_registry: role_registry_pda,
        blacklist_entry: blacklist_entry_pda,
        mint: args.mint,
        target_token_account: args.token_account,
        token_program: spl_token_2022_id(),
    }
    .to_account_metas(None);

    let ix_data = sss_token::instruction::BlacklistRemove {}.data();

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
    println!("Address {} removed from blacklist. Signature: {}", args.address, sig);

    Ok(())
}

fn spl_token_2022_id() -> Pubkey {
    solana_sdk::pubkey!("TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb")
}
