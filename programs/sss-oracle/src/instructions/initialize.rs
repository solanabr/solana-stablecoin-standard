use anchor_lang::prelude::*;

use crate::events::OracleInitialized;
use crate::state::OraclePriceConfig;

#[derive(Accounts)]
pub struct InitializeOracle<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        init,
        payer = authority,
        space = OraclePriceConfig::LEN,
        seeds = [b"oracle-price-config", authority.key().as_ref()],
        bump,
    )]
    pub oracle_config: Account<'info, OraclePriceConfig>,

    pub system_program: Program<'info, System>,
}

pub fn handler(
    ctx: Context<InitializeOracle>,
    price_feed: Pubkey,
    max_deviation_bps: u16,
    max_staleness_secs: u64,
    expected_price: u64,
    price_decimals: u8,
) -> Result<()> {
    let oracle = &mut ctx.accounts.oracle_config;
    oracle.authority = ctx.accounts.authority.key();
    oracle.price_feed = price_feed;
    oracle.max_deviation_bps = max_deviation_bps;
    oracle.max_staleness_secs = max_staleness_secs;
    oracle.expected_price = expected_price;
    oracle.price_decimals = price_decimals;
    oracle.enabled = true;
    oracle.last_validated_price = 0;
    oracle.last_validated_at = 0;
    oracle.bump = ctx.bumps.oracle_config;

    emit!(OracleInitialized {
        authority: ctx.accounts.authority.key(),
        price_feed,
        max_deviation_bps,
        max_staleness_secs,
        expected_price,
        price_decimals,
    });

    Ok(())
}
