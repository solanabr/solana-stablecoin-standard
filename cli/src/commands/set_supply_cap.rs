use crate::config::CliConfig;
use crate::pda::{get_config_pda, get_role_registry_pda, SSS_TOKEN_PROGRAM_ID};
use anchor_lang::{InstructionData, ToAccountMetas};
use anyhow::Result;
use clap::Args;
use solana_sdk::{pubkey::Pubkey, signer::Signer, transaction::Transaction};

#[derive(Args)]
pub struct SetSupplyCapArgs {
    #[arg(long)]
    pub mint: Pubkey,
    #[arg(long)]
    pub cap: u64,
}

pub fn execute(config: &CliConfig, args: &SetSupplyCapArgs) -> Result<()> {
    let (config_pda, _) = get_config_pda(&args.mint);
    let (role_registry_pda, _) = get_role_registry_pda(&config_pda);

    let accounts = sss_token::accounts::SetSupplyCap {
        authority: config.payer.pubkey(),
        config: config_pda,
        role_registry: role_registry_pda,
    }
    .to_account_metas(None);

    let ix_data = sss_token::instruction::SetSupplyCap { new_cap: args.cap }.data();

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
    println!("Supply cap updated to {}. Signature: {}", args.cap, sig);

    Ok(())
}
