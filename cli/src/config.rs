use anyhow::{Context, Result};
use solana_client::rpc_client::RpcClient;
use solana_sdk::commitment_config::CommitmentConfig;
use solana_sdk::signature::Keypair;
use solana_sdk::signer::Signer;
use std::fs;
use std::str::FromStr;

pub struct CliContext {
  pub client: RpcClient,
  pub payer: Keypair,
}

impl CliContext {
  pub fn new(cli: &super::Cli) -> Result<Self> {
    let commitment = CommitmentConfig {
      commitment: solana_sdk::commitment_config::CommitmentLevel::from_str(&cli.commitment)
        .map_err(|_| anyhow::anyhow!("Invalid commitment level: {}", cli.commitment))?,
    };
    let client = RpcClient::new_with_commitment(&cli.rpc_url, commitment);

    let keypair_data = fs::read_to_string(&cli.keypair)
      .with_context(|| format!("Failed to read keypair file: {}", cli.keypair))?;
    let keypair_bytes: Vec<u8> = serde_json::from_str(&keypair_data)
      .with_context(|| "Failed to parse keypair JSON")?;
    #[allow(deprecated)]
    let payer = Keypair::from_bytes(&keypair_bytes)
      .map_err(|e| anyhow::anyhow!("Invalid keypair: {}", e))?;

    Ok(Self { client, payer })
  }

  pub fn payer_pubkey(&self) -> solana_sdk::pubkey::Pubkey {
    self.payer.pubkey()
  }
}
