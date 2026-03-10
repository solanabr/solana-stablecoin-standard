use anyhow::{anyhow, Context, Result};
use serde::Deserialize;
use solana_sdk::{pubkey::Pubkey, signature::Keypair, signer::EncodableKey};
use std::{path::PathBuf, str::FromStr};

const DEFAULT_RPC_URL: &str = "https://api.devnet.solana.com";

/// Solana CLI config (~/.config/solana/cli/config.yml)
#[derive(Debug, Deserialize, Default)]
struct SolanaCliConfig {
    json_rpc_url: Option<String>,
    keypair_path: Option<String>,
}

#[derive(Debug, Deserialize, Default)]
struct ConfigFile {
    rpc_url: Option<String>,
    mint: Option<String>,
    keypair: Option<String>,
}

#[derive(Debug)]
pub struct CliConfig {
    pub rpc_url: String,
    /// None only when running `init` (which creates a new mint).
    pub mint: Option<Pubkey>,
    pub keypair: Keypair,
    pub keypair_path: PathBuf,
}

impl CliConfig {
    /// Load CLI config. When `require_mint` is false (e.g. for `init`), mint may be omitted.
    pub fn load(
        rpc_url_override: Option<String>,
        mint_override: Option<String>,
        keypair_override: Option<String>,
        require_mint: bool,
    ) -> Result<Self> {
        let file_config = Self::load_file().unwrap_or_default();

        let solana_config = Self::load_solana_cli_config();

        let rpc_url = rpc_url_override
            .or(file_config.rpc_url)
            .or_else(|| solana_config.json_rpc_url.clone())
            .unwrap_or_else(|| DEFAULT_RPC_URL.to_string());

        let mint_str = mint_override.or(file_config.mint);
        let mint = match mint_str {
            Some(s) => Some(
                Pubkey::from_str(&s).with_context(|| format!("Invalid mint pubkey: {s}"))?,
            ),
            None if require_mint => {
                return Err(anyhow!(
                    "Mint not specified. Use --mint <PUBKEY> or set `mint` in ~/.config/sss-token/config.toml"
                ));
            }
            None => None,
        };

        let keypair_path_str = keypair_override
            .or(file_config.keypair)
            .or_else(|| solana_config.keypair_path.clone())
            .unwrap_or_else(|| {
                let mut p = dirs_next();
                p.push(".config/solana/id.json");
                p.to_string_lossy().into_owned()
            });
        let keypair_path = PathBuf::from(&keypair_path_str);
        let keypair = Keypair::read_from_file(&keypair_path)
            .map_err(|e| anyhow!("Failed to read keypair from {}: {}", keypair_path_str, e))?;

        Ok(CliConfig {
            rpc_url,
            mint,
            keypair,
            keypair_path,
        })
    }

    fn load_file() -> Option<ConfigFile> {
        let mut path = dirs_next();
        path.push(".config/sss-token/config.toml");
        let contents = std::fs::read_to_string(path).ok()?;
        toml::from_str::<ConfigFile>(&contents).ok()
    }

    /// Load Solana CLI config from ~/.config/solana/cli/config.yml.
    /// Used as default source for rpc_url and keypair_path when not set in SSS config or CLI.
    fn load_solana_cli_config() -> SolanaCliConfig {
        let mut path = dirs_next();
        path.push(".config/solana/cli/config.yml");
        let contents = match std::fs::read_to_string(&path) {
            Ok(c) => c,
            Err(_) => return SolanaCliConfig::default(),
        };
        serde_yaml::from_str::<SolanaCliConfig>(&contents).unwrap_or_default()
    }
}

fn dirs_next() -> PathBuf {
    std::env::var("HOME")
        .map(PathBuf::from)
        .unwrap_or_else(|_| PathBuf::from("."))
}
