use std::{path::PathBuf, str::FromStr};

use anchor_client::{Client, Cluster};
use anyhow::{anyhow, Context, Result};
use clap::{Args, ValueEnum};
use serde::Deserialize;
use solana_sdk::{
    commitment_config::CommitmentConfig, pubkey::Pubkey, signature::Keypair,
    signer::EncodableKey, signer::Signer, sysvar,
};
use solana_system_interface::program::ID as SYSTEM_PROGRAM_ID;
use spl_token_2022::ID as TOKEN_2022_PROGRAM_ID;
use std::rc::Rc;

use crate::{
    config::CliConfig,
    pda,
    program_client::{accounts, args, event_authority, PROGRAM_ID, sss},
};

#[derive(Args)]
pub struct InitArgs {
    /// Use a preset configuration  [sss-1 | sss-2]
    #[arg(long, value_enum, group = "source")]
    pub preset: Option<Preset>,

    /// Path to a custom TOML configuration file
    #[arg(long, group = "source")]
    pub custom: Option<PathBuf>,

    /// Initial minting allowance (for presets)
    #[arg(long, default_value_t = 1_000_000_000_000)]
    pub initial_allowance: u64,

    /// Token name (overrides preset defaults)
    #[arg(long)]
    pub name: Option<String>,

    /// Token symbol (overrides preset defaults)
    #[arg(long)]
    pub symbol: Option<String>,

    /// Token URI (overrides preset defaults)
    #[arg(long)]
    pub uri: Option<String>,

    /// Token decimals (overrides preset defaults, default: 6)
    #[arg(long)]
    pub decimals: Option<u8>,

    /// Master pubkey (defaults to signer)
    #[arg(long)]
    pub master: Option<String>,

    /// Initial minter pubkey (defaults to signer)
    #[arg(long)]
    pub minter: Option<String>,

    /// Path to keypair file for the new mint (generates a new keypair if omitted)
    #[arg(long)]
    pub mint_keypair: Option<PathBuf>,
}

#[derive(ValueEnum, Clone, Debug)]
pub enum Preset {
    #[value(name = "sss-1")]
    Sss1,
    #[value(name = "sss-2")]
    Sss2,
}

#[derive(Deserialize)]
struct CustomConfig {
    name: String,
    symbol: String,
    uri: String,
    decimals: u8,
    master: Option<String>,
    minter: Option<String>,
    initial_allowance: u64,
    #[serde(default)]
    enable_permanent_delegate: bool,
    #[serde(default)]
    enable_transfer_hook: bool,
    #[serde(default)]
    default_account_frozen: bool,
}

struct InitParams {
    name: String,
    symbol: String,
    uri: String,
    decimals: u8,
    master: Pubkey,
    minter: Pubkey,
    initial_allowance: u64,
    enable_permanent_delegate: bool,
    enable_transfer_hook: bool,
    default_account_frozen: bool,
    is_sss2: bool,
}

pub async fn run(cfg: CliConfig, args_in: InitArgs) -> Result<()> {
    if args_in.preset.is_none() && args_in.custom.is_none() {
        return Err(anyhow!("Either --preset <sss-1|sss-2> or --custom <config.toml> must be specified"));
    }

    let signer = Rc::new(cfg.keypair);
    let signer_pubkey = signer.pubkey();

    let params = if let Some(preset) = &args_in.preset {
        build_preset_params(preset, &args_in, signer_pubkey)?
    } else {
        build_custom_params(args_in.custom.as_ref().unwrap(), &args_in, signer_pubkey)?
    };

    let mint_kp: Keypair = if let Some(kp_path) = &args_in.mint_keypair {
        Keypair::read_from_file(kp_path)
            .map_err(|e| anyhow!("Failed to read mint keypair from {:?}: {}", kp_path, e))?
    } else {
        Keypair::new()
    };
    let mint_pubkey = mint_kp.pubkey();

    let (config_pda, _) = pda::config_pda(&PROGRAM_ID, &mint_pubkey);
    let (mint_authority, _) = pda::mint_authority_pda(&PROGRAM_ID, &mint_pubkey);
    let (freeze_authority, _) = pda::freeze_authority_pda(&PROGRAM_ID, &mint_pubkey);
    let (pause_authority, _) = pda::pause_authority_pda(&PROGRAM_ID, &mint_pubkey);
    let (seizer_authority, _) = pda::seizer_authority_pda(&PROGRAM_ID, &mint_pubkey);
    let (master_role, _) = pda::master_role_pda(&PROGRAM_ID, &mint_pubkey, &params.master);
    let (minter_account, _) = pda::minter_account_pda(&PROGRAM_ID, &mint_pubkey, &params.minter);

    let standard = if params.is_sss2 {
        sss::types::Standard::SSS2
    } else {
        sss::types::Standard::SSS1
    };

    let client = Client::new_with_options(
        Cluster::Custom(cfg.rpc_url.clone(), cfg.rpc_url),
        signer.clone(),
        CommitmentConfig::confirmed(),
    );
    let program = client.program(PROGRAM_ID)?;

    let sig = program
        .request()
        .accounts(accounts::Initialize {
            admin: signer_pubkey,
            mint: mint_pubkey,
            config: config_pda,
            mint_authority,
            freeze_authority,
            seizer_authority,
            pause_authority,
            master_role,
            minter_account,
            token_program: TOKEN_2022_PROGRAM_ID,
            system_program: Pubkey::from_str(&SYSTEM_PROGRAM_ID.to_string())?,
            rent: sysvar::rent::ID,
            event_authority: event_authority(),
            program: PROGRAM_ID,
        })
        .args(args::Initialize {
            standard,
            name: params.name.clone(),
            symbol: params.symbol.clone(),
            uri: params.uri.clone(),
            decimals: params.decimals,
            master: params.master,
            minter: params.minter,
            initial_allowance: params.initial_allowance,
            enable_permanent_delegate: Some(params.enable_permanent_delegate),
            enable_transfer_hook: Some(params.enable_transfer_hook),
            default_account_frozen: Some(params.default_account_frozen),
        })
        .signer(mint_kp)
        .send()
        .await?;

    println!("Initialized mint: {}", mint_pubkey);
    println!("  Standard  : {}", if params.is_sss2 { "SSS-2" } else { "SSS-1" });
    println!("  Name      : {}", params.name);
    println!("  Symbol    : {}", params.symbol);
    println!("  Decimals  : {}", params.decimals);
    println!("  Config PDA: {}", config_pda);
    println!("  Tx        : {}", sig);

    Ok(())
}

fn build_preset_params(preset: &Preset, a: &InitArgs, signer: Pubkey) -> Result<InitParams> {
    let (is_sss2, name_d, sym_d, enable_pd, enable_th, default_frozen) = match preset {
        Preset::Sss1 => (false, "SSS-1 Stablecoin", "SSS1", false, false, false),
        // SSS-2: full compliance — permanent delegate, transfer hook, default account frozen
        Preset::Sss2 => (true, "SSS-2 Stablecoin", "SSS2", true, true, true),
    };
    Ok(InitParams {
        name: a.name.clone().unwrap_or_else(|| name_d.to_string()),
        symbol: a.symbol.clone().unwrap_or_else(|| sym_d.to_string()),
        uri: a.uri.clone().unwrap_or_else(|| "https://example.com/metadata.json".to_string()),
        decimals: a.decimals.unwrap_or(6),
        master: parse_pk(&a.master, signer)?,
        minter: parse_pk(&a.minter, signer)?,
        initial_allowance: a.initial_allowance,
        enable_permanent_delegate: enable_pd,
        enable_transfer_hook: enable_th,
        default_account_frozen: default_frozen,
        is_sss2,
    })
}

fn build_custom_params(path: &PathBuf, a: &InitArgs, signer: Pubkey) -> Result<InitParams> {
    let contents =
        std::fs::read_to_string(path).with_context(|| format!("Cannot read {}", path.display()))?;
    let c: CustomConfig = toml::from_str(&contents).context("Failed to parse config TOML")?;
    let is_sss2 = c.enable_permanent_delegate || c.enable_transfer_hook || c.default_account_frozen;
    Ok(InitParams {
        name: a.name.clone().unwrap_or(c.name),
        symbol: a.symbol.clone().unwrap_or(c.symbol),
        uri: a.uri.clone().unwrap_or(c.uri),
        decimals: a.decimals.unwrap_or(c.decimals),
        master: parse_pk(&c.master.or_else(|| a.master.clone()), signer)?,
        minter: parse_pk(&c.minter.or_else(|| a.minter.clone()), signer)?,
        initial_allowance: c.initial_allowance,
        enable_permanent_delegate: c.enable_permanent_delegate,
        enable_transfer_hook: c.enable_transfer_hook,
        default_account_frozen: c.default_account_frozen,
        is_sss2,
    })
}

fn parse_pk(s: &Option<String>, default: Pubkey) -> Result<Pubkey> {
    match s {
        Some(v) => Pubkey::from_str(v).with_context(|| format!("Invalid pubkey: {v}")),
        None => Ok(default),
    }
}
