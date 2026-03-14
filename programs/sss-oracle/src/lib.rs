use anchor_lang::prelude::*;

pub mod error;
pub mod events;
pub mod instructions;
pub mod state;

use instructions::*;

declare_id!("2i38q2b16owfBgqfKS2SB4AZX2aNUpbPVCx1ngSJtf6f");

#[program]
pub mod sss_oracle {
    use super::*;

    /// Initialize a new oracle price config PDA for the signing authority.
    pub fn initialize_oracle(
        ctx: Context<InitializeOracle>,
        price_feed: Pubkey,
        max_deviation_bps: u16,
        max_staleness_secs: u64,
        expected_price: u64,
        price_decimals: u8,
    ) -> Result<()> {
        instructions::initialize::handler(
            ctx,
            price_feed,
            max_deviation_bps,
            max_staleness_secs,
            expected_price,
            price_decimals,
        )
    }

    /// Update an existing oracle price config.
    pub fn update_oracle_config(
        ctx: Context<UpdateOracleConfig>,
        price_feed: Pubkey,
        max_deviation_bps: u16,
        max_staleness_secs: u64,
        expected_price: u64,
        price_decimals: u8,
        enabled: bool,
    ) -> Result<()> {
        instructions::update::handler(
            ctx,
            price_feed,
            max_deviation_bps,
            max_staleness_secs,
            expected_price,
            price_decimals,
            enabled,
        )
    }

    /// Validate a Pyth price feed against the oracle config.
    /// Emits a PriceValidated event with the validation result.
    pub fn validate_price(ctx: Context<ValidatePrice>) -> Result<()> {
        instructions::validate::handler(ctx)
    }
}
