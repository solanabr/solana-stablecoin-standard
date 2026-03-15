use anchor_lang::prelude::*;
use crate::state::*;

#[derive(Accounts)]
pub struct UpdateOracleConfig<'info> {
    #[account(
        mut,
        seeds = [b"oracle-config", oracle_config.mint.as_ref()],
        bump = oracle_config.bump,
        has_one = authority @ OracleError::Unauthorized,
    )]
    pub oracle_config: Account<'info, OracleFeedConfig>,

    pub authority: Signer<'info>,
}

pub fn handler(
    ctx: Context<UpdateOracleConfig>,
    new_feed: Option<Pubkey>,
    new_max_staleness: Option<u64>,
    new_max_deviation_bps: Option<u16>,
    new_max_confidence_bps: Option<u16>,
    new_target_price: Option<u64>,
    new_circuit_breaker_min: Option<u64>,
    new_circuit_breaker_max: Option<u64>,
    new_active: Option<bool>,
    reset_circuit_breaker: Option<bool>,
) -> Result<()> {
    let config = &mut ctx.accounts.oracle_config;

    if let Some(feed) = new_feed {
        config.feed_address = feed;
        msg!("Updated feed address: {}", feed);
    }
    if let Some(s) = new_max_staleness {
        config.max_staleness_secs = s;
    }
    if let Some(d) = new_max_deviation_bps {
        config.max_deviation_bps = d;
    }
    if let Some(c) = new_max_confidence_bps {
        config.max_confidence_bps = c;
    }
    if let Some(t) = new_target_price {
        config.target_price = t;
    }
    if let Some(min) = new_circuit_breaker_min {
        config.circuit_breaker_min = min;
    }
    if let Some(max) = new_circuit_breaker_max {
        config.circuit_breaker_max = max;
    }
    if let Some(active) = new_active {
        config.active = active;
    }
    if let Some(true) = reset_circuit_breaker {
        config.circuit_breaker_tripped = false;
        msg!("Circuit breaker RESET by authority");
    }

    Ok(())
}
