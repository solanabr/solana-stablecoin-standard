use anyhow::{Context, Result};
use solana_client::rpc_client::RpcClient;
use solana_sdk::{
    commitment_config::CommitmentConfig,
    signature::{read_keypair_file, Keypair},
};
use std::path::PathBuf;

pub struct CliConfig {
    pub rpc_client: RpcClient,
    pub payer: Keypair,
    pub commitment: CommitmentConfig,
}

impl CliConfig {
    pub fn new(url: &str, keypair_path: &str, commitment: &str) -> Result<Self> {
        let commitment = match commitment {
            "processed" => CommitmentConfig::processed(),
            "confirmed" => CommitmentConfig::confirmed(),
            "finalized" => CommitmentConfig::finalized(),
            _ => CommitmentConfig::confirmed(),
        };

        let rpc_client = RpcClient::new_with_commitment(url.to_string(), commitment);

        let keypair_path = resolve_keypair_path(keypair_path)?;
        let payer = read_keypair_file(&keypair_path)
            .map_err(|e| anyhow::anyhow!("Failed to read keypair from {}: {}", keypair_path.display(), e))?;

        Ok(Self {
            rpc_client,
            payer,
            commitment,
        })
    }
}

fn resolve_keypair_path(path: &str) -> Result<PathBuf> {
    let path = if path.starts_with('~') {
        let home = dirs_fallback()?;
        PathBuf::from(path.replacen('~', &home, 1))
    } else {
        PathBuf::from(path)
    };
    Ok(path)
}

fn dirs_fallback() -> Result<String> {
    std::env::var("HOME").context("HOME environment variable not set")
}
