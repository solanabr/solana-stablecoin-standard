use anyhow::Result;
use anchor_lang::AccountDeserialize;
use solana_client::rpc_client::RpcClient;
use solana_sdk::commitment_config::CommitmentConfig;

use crate::{
    config::CliConfig,
    pda,
    program_client::{sss, PROGRAM_ID},
};

pub async fn run(cfg: CliConfig) -> Result<()> {
    let rpc = RpcClient::new_with_commitment(cfg.rpc_url.clone(), CommitmentConfig::confirmed());
    let mint = cfg.mint;

    let (config_pda, _) = pda::config_pda(&PROGRAM_ID, &mint);

    let config_data = rpc
        .get_account_data(&config_pda)
        .map_err(|_| anyhow::anyhow!("Config PDA not found. Is the mint initialized?"))?;

    let config: sss::accounts::StablecoinConfig =
        sss::accounts::StablecoinConfig::try_deserialize(&mut config_data.as_slice())?;

    let standard_str = match &config.standard {
        sss::types::Standard::SSS1 => "SSS-1",
        sss::types::Standard::SSS2 => "SSS-2",
    };

    println!("Mint:                  {}", mint);
    println!("Standard:              {}", standard_str);
    println!("Name:                  {}", config.name);
    println!("Symbol:                {}", config.symbol);
    println!("URI:                   {}", config.uri);
    println!("Decimals:              {}", config.decimals);
    println!("Permanent delegate:    {}", config.enable_permanent_delegate);
    println!("Transfer hook:         {}", config.enable_transfer_hook);
    println!("Default frozen:        {}", config.default_account_frozen);

    Ok(())
}
