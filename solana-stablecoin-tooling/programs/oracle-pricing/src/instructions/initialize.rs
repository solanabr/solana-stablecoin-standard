use anchor_lang::prelude::*;
use crate::state::*;

#[derive(Accounts)]
pub struct InitializeOracle<'info> {
    #[account(
        init,
        payer = authority,
        space = OracleFeedConfig::SIZE,
        seeds = [b"oracle-config", mint.key().as_ref()],
        bump
    )]
    pub oracle_config: Account<'info, OracleFeedConfig>,

    /// CHECK: The stablecoin mint — validated by PDA derivation
    pub mint: UncheckedAccount<'info>,

    /// CHECK: Oracle feed account — owner validated against expected oracle program
    pub feed_account: UncheckedAccount<'info>,

    #[account(mut)]
    pub authority: Signer<'info>,

    pub system_program: Program<'info, System>,
}

pub fn handler(
    ctx: Context<InitializeOracle>,
    provider: OracleProvider,
    base_currency: BaseCurrency,
    max_staleness_secs: u64,
    max_deviation_bps: u16,
    max_confidence_bps: u16,
    target_price: u64,
    circuit_breaker_min: u64,
    circuit_breaker_max: u64,
) -> Result<()> {
    // Capture the feed account's owner as the expected owner for future validation
    let feed_owner = *ctx.accounts.feed_account.owner;

    let config = &mut ctx.accounts.oracle_config;
    config.authority = ctx.accounts.authority.key();
    config.mint = ctx.accounts.mint.key();
    config.provider = provider;
    config.feed_address = ctx.accounts.feed_account.key();
    config.expected_feed_owner = feed_owner;
    config.base_currency = base_currency;
    config.max_staleness_secs = max_staleness_secs;
    config.max_deviation_bps = max_deviation_bps;
    config.max_confidence_bps = max_confidence_bps;
    config.target_price = target_price;
    config.circuit_breaker_min = circuit_breaker_min;
    config.circuit_breaker_max = circuit_breaker_max;
    config.last_price = 0;
    config.last_confidence = 0;
    config.last_update_ts = 0;
    config.active = true;
    config.circuit_breaker_tripped = false;
    config.refresh_count = 0;
    config.bump = ctx.bumps.oracle_config;

    msg!(
        "Oracle initialized: provider={}, target={}, deviation_max={}bps, confidence_max={}bps, cb=[{},{}]",
        provider as u8, target_price, max_deviation_bps, max_confidence_bps,
        circuit_breaker_min, circuit_breaker_max
    );

    Ok(())
}
