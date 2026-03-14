use anchor_lang::prelude::*;

use crate::error::OracleError;
use crate::events::OracleConfigUpdated;
use crate::state::OraclePriceConfig;

#[derive(Accounts)]
pub struct UpdateOracleConfig<'info> {
    pub authority: Signer<'info>,

    #[account(
        mut,
        seeds = [b"oracle-price-config", authority.key().as_ref()],
        bump = oracle_config.bump,
        constraint = oracle_config.authority == authority.key() @ OracleError::Unauthorized,
    )]
    pub oracle_config: Account<'info, OraclePriceConfig>,
}

pub fn handler(
    ctx: Context<UpdateOracleConfig>,
    price_feed: Pubkey,
    max_deviation_bps: u16,
    max_staleness_secs: u64,
    expected_price: u64,
    price_decimals: u8,
    enabled: bool,
) -> Result<()> {
    let oracle = &mut ctx.accounts.oracle_config;
    oracle.price_feed = price_feed;
    oracle.max_deviation_bps = max_deviation_bps;
    oracle.max_staleness_secs = max_staleness_secs;
    oracle.expected_price = expected_price;
    oracle.price_decimals = price_decimals;
    oracle.enabled = enabled;

    emit!(OracleConfigUpdated {
        authority: ctx.accounts.authority.key(),
        price_feed,
        max_deviation_bps,
        max_staleness_secs,
        expected_price,
        price_decimals,
        enabled,
    });

    Ok(())
}
