use crate::config::CliConfig;
use crate::pda::{
    get_config_pda, get_extra_account_meta_list_pda, get_role_registry_pda,
    SSS_TRANSFER_HOOK_PROGRAM_ID,
};
use anchor_lang::{InstructionData, ToAccountMetas};
use anyhow::{Context, Result};
use clap::Args;
use serde::Deserialize;
use solana_sdk::{
    instruction::AccountMeta, pubkey::Pubkey, signature::Keypair, signer::Signer, sysvar::rent,
    transaction::Transaction,
};
use sss_token::state::StablecoinPreset;

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
    #[arg(long, help = "Path to TOML config file (for custom preset)")]
    pub config: Option<String>,
}

#[derive(Deserialize)]
pub struct TomlConfig {
    pub name: Option<String>,
    pub symbol: Option<String>,
    pub uri: Option<String>,
    pub decimals: Option<u8>,
    pub enable_permanent_delegate: Option<bool>,
    pub enable_transfer_hook: Option<bool>,
    pub default_account_frozen: Option<bool>,
    pub enable_confidential_transfers: Option<bool>,
}

fn parse_preset(s: &str) -> Result<StablecoinPreset, String> {
    match s.to_lowercase().as_str() {
        "sss-1" | "sss1" => Ok(StablecoinPreset::SSS1),
        "sss-2" | "sss2" => Ok(StablecoinPreset::SSS2),
        "sss-3" | "sss3" => Ok(StablecoinPreset::SSS3),
        "custom" => Ok(StablecoinPreset::Custom),
        _ => Err(format!(
            "Invalid preset: {}. Use sss-1, sss-2, sss-3, or custom",
            s
        )),
    }
}

pub fn execute(config: &CliConfig, args: &InitArgs) -> Result<()> {
    let mint = Keypair::new();
    let (config_pda, _) = get_config_pda(&mint.pubkey());
    let (role_registry_pda, _) = get_role_registry_pda(&config_pda);

    let token_program = spl_token_2022_id();
    let system_program = solana_sdk::pubkey!("11111111111111111111111111111111");

    // If --config is provided with custom preset, load TOML overrides
    let toml_config = if let Some(config_path) = &args.config {
        let content = std::fs::read_to_string(config_path)
            .with_context(|| format!("Failed to read config file: {}", config_path))?;
        Some(toml::from_str::<TomlConfig>(&content).context("Failed to parse TOML config")?)
    } else {
        None
    };

    let name = toml_config
        .as_ref()
        .and_then(|c| c.name.clone())
        .unwrap_or_else(|| args.name.clone());
    let symbol = toml_config
        .as_ref()
        .and_then(|c| c.symbol.clone())
        .unwrap_or_else(|| args.symbol.clone());
    let uri = toml_config
        .as_ref()
        .and_then(|c| c.uri.clone())
        .unwrap_or_else(|| args.uri.clone());
    let decimals = toml_config
        .as_ref()
        .and_then(|c| c.decimals)
        .unwrap_or(args.decimals);

    let (custom_pd, custom_th, custom_df, custom_ct) =
        if matches!(args.preset, StablecoinPreset::Custom) {
            let tc = toml_config.as_ref();
            (
                Some(
                    tc.and_then(|c| c.enable_permanent_delegate)
                        .unwrap_or(false),
                ),
                Some(tc.and_then(|c| c.enable_transfer_hook).unwrap_or(false)),
                Some(tc.and_then(|c| c.default_account_frozen).unwrap_or(false)),
                Some(
                    tc.and_then(|c| c.enable_confidential_transfers)
                        .unwrap_or(false),
                ),
            )
        } else {
            (None, None, None, None)
        };

    let should_initialize_transfer_hook =
        matches!(args.preset, StablecoinPreset::SSS2) || custom_th == Some(true);

    let params = sss_token::instructions::InitializeParams {
        name,
        symbol,
        uri,
        decimals,
        preset: args.preset,
        enable_permanent_delegate: custom_pd,
        enable_transfer_hook: custom_th,
        enable_default_state_frozen: custom_df,
        enable_confidential_transfers: custom_ct,
    };

    let mut accounts = sss_token::accounts::Initialize {
        authority: config.payer.pubkey(),
        mint: mint.pubkey(),
        config: config_pda,
        role_registry: role_registry_pda,
        system_program,
        token_program,
        rent: rent::id(),
    }
    .to_account_metas(None);

    // Add hook program as remaining account when transfer hook is enabled
    if should_initialize_transfer_hook {
        accounts.push(AccountMeta::new_readonly(
            SSS_TRANSFER_HOOK_PROGRAM_ID,
            false,
        ));
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

    if should_initialize_transfer_hook {
        let (extra_account_meta_list_pda, _) = get_extra_account_meta_list_pda(&mint.pubkey());
        let hook_accounts = sss_transfer_hook::accounts::InitializeExtraAccountMetaList {
            payer: config.payer.pubkey(),
            authority: config.payer.pubkey(),
            extra_account_meta_list: extra_account_meta_list_pda,
            mint: mint.pubkey(),
            config: config_pda,
            system_program,
        }
        .to_account_metas(None);

        let hook_ix_data = sss_transfer_hook::instruction::InitializeExtraAccountMetaList {}.data();
        let hook_ix = solana_sdk::instruction::Instruction {
            program_id: SSS_TRANSFER_HOOK_PROGRAM_ID,
            accounts: hook_accounts,
            data: hook_ix_data,
        };

        let recent_blockhash = config.rpc_client.get_latest_blockhash()?;
        let hook_tx = Transaction::new_signed_with_payer(
            &[hook_ix],
            Some(&config.payer.pubkey()),
            &[&config.payer],
            recent_blockhash,
        );

        let hook_sig = config.rpc_client.send_and_confirm_transaction(&hook_tx)?;

        println!("Transfer hook ExtraAccountMetaList initialized");
        println!("  ExtraAccountMetaList: {}", extra_account_meta_list_pda);
        println!("  Signature: {}", hook_sig);
    }

    Ok(())
}

fn spl_token_2022_id() -> Pubkey {
    solana_sdk::pubkey!("TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb")
}
