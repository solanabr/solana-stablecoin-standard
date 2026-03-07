use anyhow::Result;
use solana_client::rpc_client::RpcClient;
use solana_sdk::commitment_config::CommitmentConfig;
use spl_token_2022::state::Mint;
use anchor_lang::solana_program::program_pack::Pack;

use crate::config::CliConfig;

pub async fn run(cfg: CliConfig) -> Result<()> {
    let rpc = RpcClient::new_with_commitment(cfg.rpc_url.clone(), CommitmentConfig::confirmed());

    let mint_data = rpc.get_account_data(&cfg.mint)?;
    let mint_state = Mint::unpack_from_slice(&mint_data[..Mint::LEN])
        .map_err(|_| anyhow::anyhow!("Failed to parse mint account"))?;

    println!("Mint:    {}", cfg.mint);
    println!("Supply:  {} (base units)", mint_state.supply);

    Ok(())
}
