use crate::config::CliConfig;
use crate::display;
use crate::pda::{get_config_pda, get_role_registry_pda};
use anchor_lang::AccountDeserialize;
use anyhow::{Context, Result};
use clap::Args;
use solana_sdk::pubkey::Pubkey;
use sss_token::state::{RoleRegistry, StablecoinConfig};

#[derive(Args)]
pub struct InfoArgs {
    #[arg(long)]
    pub mint: Pubkey,
}

pub fn execute(config: &CliConfig, args: &InfoArgs) -> Result<()> {
    let (config_pda, _) = get_config_pda(&args.mint);
    let (role_registry_pda, _) = get_role_registry_pda(&config_pda);

    let config_data = config
        .rpc_client
        .get_account_data(&config_pda)
        .context("Failed to fetch config account. Is this mint initialized?")?;
    let stablecoin_config = StablecoinConfig::try_deserialize(&mut &config_data[..])
        .context("Failed to deserialize StablecoinConfig")?;

    let roles_data = config
        .rpc_client
        .get_account_data(&role_registry_pda)
        .context("Failed to fetch role registry account")?;
    let role_registry = RoleRegistry::try_deserialize(&mut &roles_data[..])
        .context("Failed to deserialize RoleRegistry")?;

    display::display_config(&stablecoin_config, &role_registry);

    Ok(())
}
