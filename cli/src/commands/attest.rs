use crate::config::CliConfig;
use crate::pda::{
    get_config_pda, get_reserve_attestation_pda, get_role_registry_pda, SSS_TOKEN_PROGRAM_ID,
};
use anchor_lang::{AccountDeserialize, InstructionData, ToAccountMetas};
use anyhow::{Context, Result};
use clap::Args;
use solana_sdk::{pubkey::Pubkey, signer::Signer, transaction::Transaction};
use sss_token::state::StablecoinConfig;

#[derive(Args)]
pub struct AttestArgs {
    #[arg(long)]
    pub mint: Pubkey,
    #[arg(long, help = "SHA-256 hash as hex string (64 chars)")]
    pub hash: String,
    #[arg(long, help = "Total reserves in USD cents")]
    pub reserves_usd: u64,
    #[arg(long, default_value = "")]
    pub uri: String,
}

pub fn execute(config: &CliConfig, args: &AttestArgs) -> Result<()> {
    let (config_pda, _) = get_config_pda(&args.mint);
    let (role_registry_pda, _) = get_role_registry_pda(&config_pda);

    // Fetch current config to get reserve_attestation_index
    let account_data = config
        .rpc_client
        .get_account_data(&config_pda)
        .context("Failed to fetch config account")?;
    let stablecoin_config = StablecoinConfig::try_deserialize(&mut &account_data[..])
        .context("Failed to deserialize config")?;

    let (attestation_pda, _) =
        get_reserve_attestation_pda(&config_pda, stablecoin_config.reserve_attestation_index);

    let hash_bytes = parse_hash(&args.hash)?;

    let params = sss_token::instructions::AttestReserveParams {
        reserve_hash: hash_bytes,
        total_reserves_usd: args.reserves_usd,
        attestation_uri: args.uri.clone(),
    };

    let accounts = sss_token::accounts::AttestReserve {
        authority: config.payer.pubkey(),
        config: config_pda,
        role_registry: role_registry_pda,
        attestation: attestation_pda,
        system_program: solana_sdk::pubkey!("11111111111111111111111111111111"),
    }
    .to_account_metas(None);

    let ix_data = sss_token::instruction::AttestReserve { params }.data();

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
        "Reserve attestation recorded (index {}). Signature: {}",
        stablecoin_config.reserve_attestation_index, sig
    );

    Ok(())
}

fn parse_hash(hex: &str) -> Result<[u8; 32]> {
    let hex = hex.strip_prefix("0x").unwrap_or(hex);
    anyhow::ensure!(hex.len() == 64, "Hash must be 64 hex characters (32 bytes)");

    let bytes: Vec<u8> = (0..64)
        .step_by(2)
        .map(|i| u8::from_str_radix(&hex[i..i + 2], 16))
        .collect::<Result<Vec<_>, _>>()
        .context("Invalid hex in hash")?;

    let mut arr = [0u8; 32];
    arr.copy_from_slice(&bytes);
    Ok(arr)
}
