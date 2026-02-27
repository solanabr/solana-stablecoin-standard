use anyhow::Result;
use clap::Args;
use solana_sdk::{
    pubkey::Pubkey,
    signer::Signer,
    transaction::Transaction,
};
use anchor_lang::{InstructionData, ToAccountMetas};
use sss_token::state::Role;
use crate::config::CliConfig;
use crate::pda::{get_config_pda, get_role_registry_pda, SSS_TOKEN_PROGRAM_ID};

#[derive(Args)]
pub struct RolesArgs {
    #[arg(long)]
    pub mint: Pubkey,
    #[arg(long, value_parser = parse_role)]
    pub role: Role,
    #[arg(long)]
    pub new_holder: Pubkey,
}

fn parse_role(s: &str) -> Result<Role, String> {
    match s.to_lowercase().as_str() {
        "pauser" => Ok(Role::Pauser),
        "blacklister" => Ok(Role::Blacklister),
        "seizer" => Ok(Role::Seizer),
        _ => Err(format!("Invalid role: {}. Use pauser, blacklister, or seizer", s)),
    }
}

pub fn execute(config: &CliConfig, args: &RolesArgs) -> Result<()> {
    let (config_pda, _) = get_config_pda(&args.mint);
    let (role_registry_pda, _) = get_role_registry_pda(&config_pda);

    let accounts = sss_token::accounts::UpdateRoles {
        authority: config.payer.pubkey(),
        config: config_pda,
        role_registry: role_registry_pda,
    }
    .to_account_metas(None);

    let params = sss_token::instructions::UpdateRoleParams {
        role: args.role,
        new_holder: args.new_holder,
    };
    let ix_data = sss_token::instruction::UpdateRoles { params }.data();

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
    println!("Role updated. Signature: {}", sig);

    Ok(())
}
