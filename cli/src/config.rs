use anyhow::{anyhow, Context, Result};
use serde::Deserialize;
use solana_sdk::{pubkey::Pubkey, signature::Keypair, signer::EncodableKey};
use std::{path::PathBuf, str::FromStr};

const DEFAULT_RPC_URL: &str = "https://api.devnet.solana.com";

#[derive(Debug, Deserialize, Default)]
struct ConfigFile {
    rpc_url: Option<String>,
    mint: Option<String>,
    keypair: Option<String>,
}

#[derive(Debug)]
pub struct CliConfig {
    pub rpc_url: String,
    pub mint: Pubkey,
    pub keypair: Keypair,
    pub keypair_path: PathBuf,
}

impl CliConfig {
    pub fn load(
        rpc_url_override: Option<String>,
        mint_override: Option<String>,
        keypair_override: Option<String>,
    ) -> Result<Self> {
        let file_config = Self::load_file().unwrap_or_default();

        let rpc_url = rpc_url_override
            .or(file_config.rpc_url)
            .unwrap_or_else(|| DEFAULT_RPC_URL.to_string());

        let mint_str = mint_override
            .or(file_config.mint)
            .ok_or_else(|| anyhow!("Mint not specified. Use --mint <PUBKEY> or set `mint` in ~/.config/sss-token/config.toml"))?;
        let mint = Pubkey::from_str(&mint_str)
            .with_context(|| format!("Invalid mint pubkey: {mint_str}"))?;

        let keypair_path_str = keypair_override
            .or(file_config.keypair)
            .unwrap_or_else(|| {
                let mut p = dirs_next();
                p.push(".config/solana/id.json");
                p.to_string_lossy().into_owned()
            });
        let keypair_path = PathBuf::from(&keypair_path_str);
        let keypair = Keypair::read_from_file(&keypair_path)
            .map_err(|e| anyhow!("Failed to read keypair from {}: {}", keypair_path_str, e))?;

        Ok(CliConfig { rpc_url, mint, keypair, keypair_path })
    }

    fn load_file() -> Option<ConfigFile> {
        let mut path = dirs_next();
        path.push(".config/sss-token/config.toml");
        let contents = std::fs::read_to_string(path).ok()?;
        toml::from_str::<ConfigFile>(&contents).ok()
    }
}

fn dirs_next() -> PathBuf {
    std::env::var("HOME")
        .map(PathBuf::from)
        .unwrap_or_else(|_| PathBuf::from("."))
}
