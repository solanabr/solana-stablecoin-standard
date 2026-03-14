use anchor_lang::prelude::*;

use crate::constants::*;
use crate::error::StablecoinError;
use crate::events::OracleConfigured;
use crate::state::{StablecoinConfig, OracleConfig};

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct ConfigureOracleInput {
    pub price_feed: Pubkey,
    pub max_deviation_bps: u16,
    pub max_staleness_secs: u64,
    pub enabled: bool,
}

#[derive(Accounts)]
pub struct ConfigureOracle<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        seeds = [CONFIG_SEED, config.mint.as_ref()],
        bump = config.bump,
        constraint = authority.key() == config.authority @ StablecoinError::Unauthorized,
    )]
    pub config: Account<'info, StablecoinConfig>,

    #[account(
        init_if_needed,
        payer = authority,
        space = OracleConfig::LEN,
        seeds = [ORACLE_CONFIG_SEED, config.key().as_ref()],
        bump
    )]
    pub oracle_config: Account<'info, OracleConfig>,

    pub system_program: Program<'info, System>,
}

pub fn configure_oracle_handler(
    ctx: Context<ConfigureOracle>,
    input: ConfigureOracleInput,
) -> Result<()> {
    let oracle = &mut ctx.accounts.oracle_config;
    oracle.config = ctx.accounts.config.key();
    oracle.price_feed = input.price_feed;
    oracle.max_deviation_bps = input.max_deviation_bps;
    oracle.max_staleness_secs = input.max_staleness_secs;
    oracle.enabled = input.enabled;
    oracle.bump = ctx.bumps.oracle_config;

    emit!(OracleConfigured {
        config: ctx.accounts.config.key(),
        price_feed: input.price_feed,
        max_deviation_bps: input.max_deviation_bps,
        max_staleness_secs: input.max_staleness_secs,
        enabled: input.enabled,
    });

    Ok(())
}
