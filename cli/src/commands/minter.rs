use crate::config::CliConfig;
use crate::pda::{
    get_config_pda, get_minter_info_pda, get_role_registry_pda, SSS_TOKEN_PROGRAM_ID,
};
use anchor_lang::{InstructionData, ToAccountMetas};
use anyhow::Result;
use clap::Args;
use solana_sdk::{pubkey::Pubkey, signer::Signer, transaction::Transaction};

#[derive(Args)]
pub struct MinterArgs {
    #[arg(long)]
    pub mint: Pubkey,
    #[arg(long)]
    pub wallet: Pubkey,
    #[arg(long)]
    pub active: bool,
    #[arg(long, default_value_t = 0)]
    pub quota: u64,
}

pub fn execute(config: &CliConfig, args: &MinterArgs) -> Result<()> {
    let (config_pda, _) = get_config_pda(&args.mint);
    let (role_registry_pda, _) = get_role_registry_pda(&config_pda);
    let (minter_info_pda, _) = get_minter_info_pda(&config_pda, &args.wallet);

    let accounts = sss_token::accounts::UpdateMinter {
        authority: config.payer.pubkey(),
        config: config_pda,
        role_registry: role_registry_pda,
        minter_info: minter_info_pda,
        minter_wallet: args.wallet,
        system_program: solana_sdk::pubkey!("11111111111111111111111111111111"),
    }
    .to_account_metas(None);

    let params = sss_token::instructions::UpdateMinterParams {
        is_active: args.active,
        mint_quota: args.quota,
    };
    let ix_data = sss_token::instruction::UpdateMinter { params }.data();

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
    println!("Minter updated. Signature: {}", sig);

    Ok(())
}
