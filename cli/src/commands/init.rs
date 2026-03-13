use crate::config::CliConfig;
use crate::pda::{
    get_config_pda, get_extra_account_meta_list_pda, get_role_registry_pda,
    SSS_TRANSFER_HOOK_PROGRAM_ID,
};
use anchor_lang::{AccountDeserialize, InstructionData, ToAccountMetas};
use anyhow::{Context, Result};
use clap::Args;
use serde::Deserialize;
use solana_sdk::{
    instruction::AccountMeta, pubkey::Pubkey, signature::Keypair, signer::Signer, sysvar::rent,
    transaction::Transaction,
};
use sss_token::state::{StablecoinConfig, StablecoinPreset};
use std::str::FromStr;

#[derive(Args)]
pub struct InitArgs {
    #[arg(long, value_parser = parse_preset, required_unless_present = "retry_hook_setup")]
    pub preset: Option<StablecoinPreset>,
    #[arg(long, required_unless_present = "retry_hook_setup")]
    pub name: Option<String>,
    #[arg(long, required_unless_present = "retry_hook_setup")]
    pub symbol: Option<String>,
    #[arg(long, default_value = "")]
    pub uri: String,
    #[arg(long, default_value_t = 6)]
    pub decimals: u8,
    #[arg(long, help = "Path to TOML config file (for custom preset)")]
    pub config: Option<String>,
    #[arg(
        long,
        help = "Retry transfer hook setup for a previously initialized mint that is missing its ExtraAccountMetaList"
    )]
    pub retry_hook_setup: bool,
    #[arg(
        long,
        help = "Mint address (required with --retry-hook-setup)",
        requires = "retry_hook_setup"
    )]
    pub mint: Option<String>,
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
    if args.retry_hook_setup {
        return retry_hook_setup(config, args);
    }

    let preset = args
        .preset
        .ok_or_else(|| anyhow::anyhow!("--preset is required unless --retry-hook-setup is used"))?;
    let default_name = args
        .name
        .clone()
        .ok_or_else(|| anyhow::anyhow!("--name is required unless --retry-hook-setup is used"))?;
    let default_symbol = args
        .symbol
        .clone()
        .ok_or_else(|| anyhow::anyhow!("--symbol is required unless --retry-hook-setup is used"))?;

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
        .unwrap_or(default_name);
    let symbol = toml_config
        .as_ref()
        .and_then(|c| c.symbol.clone())
        .unwrap_or(default_symbol);
    let uri = toml_config
        .as_ref()
        .and_then(|c| c.uri.clone())
        .unwrap_or_else(|| args.uri.clone());
    let decimals = toml_config
        .as_ref()
        .and_then(|c| c.decimals)
        .unwrap_or(args.decimals);

    let (custom_pd, custom_th, custom_df, custom_ct) =
        if matches!(preset, StablecoinPreset::Custom) {
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
        matches!(preset, StablecoinPreset::SSS2) || custom_th == Some(true);

    let params = sss_token::instructions::InitializeParams {
        name,
        symbol,
        uri,
        decimals,
        preset,
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

    let init_ix = solana_sdk::instruction::Instruction {
        program_id: crate::pda::SSS_TOKEN_PROGRAM_ID,
        accounts,
        data: ix_data,
    };

    // Build all instructions for a single atomic transaction
    let mut instructions = vec![init_ix];

    if should_initialize_transfer_hook {
        let hook_ix = build_hook_setup_ix(config, &mint.pubkey(), &config_pda, &system_program);
        instructions.push(hook_ix);
    }

    let recent_blockhash = config.rpc_client.get_latest_blockhash()?;
    let tx = Transaction::new_signed_with_payer(
        &instructions,
        Some(&config.payer.pubkey()),
        &[&config.payer, &mint],
        recent_blockhash,
    );

    let sig = config
        .rpc_client
        .send_and_confirm_transaction(&tx)
        .context(if should_initialize_transfer_hook {
            format!(
                "Failed to initialize stablecoin with transfer hook.\n\
                 Mint: {}\n\
                 Both initialization and hook setup were submitted atomically \
                 — no partial state was created. You can safely retry.",
                mint.pubkey()
            )
        } else {
            "Failed to initialize stablecoin".to_string()
        })?;

    println!("Stablecoin initialized!");
    println!("  Mint:      {}", mint.pubkey());
    println!("  Config:    {}", config_pda);
    println!("  Signature: {}", sig);

    if should_initialize_transfer_hook {
        let (extra_account_meta_list_pda, _) = get_extra_account_meta_list_pda(&mint.pubkey());
        println!("  Transfer hook ExtraAccountMetaList initialized");
        println!("  ExtraAccountMetaList: {}", extra_account_meta_list_pda);
    }

    Ok(())
}

/// Retry hook setup for a previously initialized mint that is missing its ExtraAccountMetaList.
fn retry_hook_setup(config: &CliConfig, args: &InitArgs) -> Result<()> {
    let mint_str = args.mint.as_ref().ok_or_else(|| {
        anyhow::anyhow!("--mint is required with --retry-hook-setup.\n\
            Usage: sss-token init --retry-hook-setup --mint <MINT_ADDRESS>")
    })?;
    let mint_pubkey =
        Pubkey::from_str(mint_str).context("Invalid mint address: must be a base58 pubkey")?;

    let (config_pda, _) = get_config_pda(&mint_pubkey);
    let (extra_account_meta_list_pda, _) = get_extra_account_meta_list_pda(&mint_pubkey);
    let system_program = solana_sdk::pubkey!("11111111111111111111111111111111");

    // Idempotency check: skip if the ExtraAccountMetaList account already exists
    if let Ok(account) = config.rpc_client.get_account(&extra_account_meta_list_pda) {
        if !account.data.is_empty() {
            println!("ExtraAccountMetaList already exists for mint {}", mint_pubkey);
            println!("  ExtraAccountMetaList: {}", extra_account_meta_list_pda);
            println!("No action needed — hook setup is already complete.");
            return Ok(());
        }
    }

    // Verify the mint was actually initialized with this program and needs hook setup
    let config_data = config
        .rpc_client
        .get_account_data(&config_pda)
        .context(format!(
            "Could not find config account for mint {}.\n\
             Ensure this mint was initialized with sss-token.",
            mint_pubkey
        ))?;
    let stablecoin_config = StablecoinConfig::try_deserialize(&mut &config_data[..])
        .context("Failed to deserialize stablecoin config")?;

    anyhow::ensure!(
        stablecoin_config.enable_transfer_hook,
        "Mint {} was not initialized with the transfer-hook feature enabled.",
        mint_pubkey
    );

    let hook_ix = build_hook_setup_ix(config, &mint_pubkey, &config_pda, &system_program);

    let recent_blockhash = config.rpc_client.get_latest_blockhash()?;
    let tx = Transaction::new_signed_with_payer(
        &[hook_ix],
        Some(&config.payer.pubkey()),
        &[&config.payer],
        recent_blockhash,
    );

    let sig = config
        .rpc_client
        .send_and_confirm_transaction(&tx)
        .context(format!(
            "Failed to initialize ExtraAccountMetaList for mint {}.\n\
             The mint exists but the transfer hook setup failed.\n\
             You can retry with: sss-token init --retry-hook-setup --mint {}",
            mint_pubkey, mint_pubkey
        ))?;

    println!("Transfer hook ExtraAccountMetaList initialized!");
    println!("  Mint:                {}", mint_pubkey);
    println!("  ExtraAccountMetaList: {}", extra_account_meta_list_pda);
    println!("  Signature:           {}", sig);

    Ok(())
}

/// Build the ExtraAccountMetaList initialization instruction for a given mint.
fn build_hook_setup_ix(
    config: &CliConfig,
    mint: &Pubkey,
    config_pda: &Pubkey,
    system_program: &Pubkey,
) -> solana_sdk::instruction::Instruction {
    let (extra_account_meta_list_pda, _) = get_extra_account_meta_list_pda(mint);
    let hook_accounts = sss_transfer_hook::accounts::InitializeExtraAccountMetaList {
        payer: config.payer.pubkey(),
        authority: config.payer.pubkey(),
        extra_account_meta_list: extra_account_meta_list_pda,
        mint: *mint,
        config: *config_pda,
        system_program: *system_program,
    }
    .to_account_metas(None);

    let hook_ix_data = sss_transfer_hook::instruction::InitializeExtraAccountMetaList {}.data();
    solana_sdk::instruction::Instruction {
        program_id: SSS_TRANSFER_HOOK_PROGRAM_ID,
        accounts: hook_accounts,
        data: hook_ix_data,
    }
}

fn spl_token_2022_id() -> Pubkey {
    solana_sdk::pubkey!("TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb")
}
