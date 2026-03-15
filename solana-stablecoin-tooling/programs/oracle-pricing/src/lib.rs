use anchor_lang::prelude::*;

pub mod state;
pub mod instructions;

use instructions::*;
use state::*;

declare_id!("OrcL8pRf5G8ZxqkNBhREedUiXK3X4LC5GFDnGkuSvCn");

#[program]
pub mod sss_oracle_pricing {
    use super::*;

    /// Initialize an oracle feed config for a stablecoin mint.
    /// The feed account's owner is captured and enforced on future validations.
    pub fn initialize_oracle(
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
        initialize::handler(
            ctx, provider, base_currency, max_staleness_secs,
            max_deviation_bps, max_confidence_bps, target_price,
            circuit_breaker_min, circuit_breaker_max,
        )
    }

    /// Refresh cached oracle price. Permissionless.
    /// Validates: feed owner, staleness, confidence, circuit breaker bounds.
    pub fn refresh_price(ctx: Context<RefreshPrice>) -> Result<()> {
        refresh_price::handler(ctx)
    }

    /// Validate oracle price for mint/redeem gating (CPI target).
    /// Full validation: owner, staleness, confidence, deviation, circuit breaker.
    /// Returns PriceQuote via set_return_data.
    pub fn validate_price(ctx: Context<ValidatePrice>) -> Result<()> {
        validate_price::handler(ctx)
    }

    /// Update oracle config. Authority only. Can reset circuit breaker.
    pub fn update_oracle_config(
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
        update_config::handler(
            ctx, new_feed, new_max_staleness, new_max_deviation_bps,
            new_max_confidence_bps, new_target_price, new_circuit_breaker_min,
            new_circuit_breaker_max, new_active, reset_circuit_breaker,
        )
    }
}
