use anyhow::Result;
use clap::Args;
use solana_sdk::{
    pubkey::Pubkey,
    signature::Keypair,
    signer::Signer,
    system_program,
    sysvar::rent,
    transaction::Transaction,
    instruction::AccountMeta,
};
use anchor_lang::{InstructionData, ToAccountMetas};
use sss_token::state::StablecoinPreset;
use crate::config::CliConfig;
use crate::pda::{get_config_pda, get_role_registry_pda, SSS_TRANSFER_HOOK_PROGRAM_ID};

#[derive(Args)]
pub struct InitArgs {
    #[arg(long, value_parser = parse_preset)]
    pub preset: StablecoinPreset,
    #[arg(long)]
    pub name: String,
    #[arg(long)]
    pub symbol: String,
    #[arg(long, default_value = "")]
    pub uri: String,
    #[arg(long, default_value_t = 6)]
    pub decimals: u8,
}

fn parse_preset(s: &str) -> Result<StablecoinPreset, String> {
    match s.to_lowercase().as_str() {
        "sss-1" | "sss1" => Ok(StablecoinPreset::SSS1),
        "sss-2" | "sss2" => Ok(StablecoinPreset::SSS2),
        "sss-3" | "sss3" => Ok(StablecoinPreset::SSS3),
        "custom" => Ok(StablecoinPreset::Custom),
        _ => Err(format!("Invalid preset: {}. Use sss-1, sss-2, sss-3, or custom", s)),
    }
}

pub fn execute(config: &CliConfig, args: &InitArgs) -> Result<()> {
    let mint = Keypair::new();
    let (config_pda, _) = get_config_pda(&mint.pubkey());
    let (role_registry_pda, _) = get_role_registry_pda(&config_pda);

    let token_program = spl_token_2022_id();

    let params = sss_token::instructions::InitializeParams {
        name: args.name.clone(),
        symbol: args.symbol.clone(),
        uri: args.uri.clone(),
        decimals: args.decimals,
        preset: args.preset,
    };

    let mut accounts = sss_token::accounts::Initialize {
        authority: config.payer.pubkey(),
        mint: mint.pubkey(),
        config: config_pda,
        role_registry: role_registry_pda,
        system_program: system_program::id(),
        token_program,
        rent: rent::id(),
    }
    .to_account_metas(None);

    // For SSS-2, add hook program as remaining account
    if matches!(args.preset, StablecoinPreset::SSS2) {
        accounts.push(AccountMeta::new_readonly(SSS_TRANSFER_HOOK_PROGRAM_ID, false));
    }

    let ix_data = sss_token::instruction::Initialize { params }.data();

    let ix = solana_sdk::instruction::Instruction {
        program_id: crate::pda::SSS_TOKEN_PROGRAM_ID,
        accounts,
        data: ix_data,
    };

    let recent_blockhash = config.rpc_client.get_latest_blockhash()?;
    let tx = Transaction::new_signed_with_payer(
        &[ix],
        Some(&config.payer.pubkey()),
        &[&config.payer, &mint],
        recent_blockhash,
    );

    let sig = config.rpc_client.send_and_confirm_transaction(&tx)?;

    println!("Stablecoin initialized!");
    println!("  Mint:      {}", mint.pubkey());
    println!("  Config:    {}", config_pda);
    println!("  Signature: {}", sig);

    Ok(())
}

fn spl_token_2022_id() -> Pubkey {
    solana_sdk::pubkey!("TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb")
}
