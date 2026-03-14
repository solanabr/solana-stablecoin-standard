use anchor_lang::prelude::*;

pub mod state;
pub mod errors;
pub mod events;
pub mod instructions;

use instructions::*;

declare_id!("BHWh9mmJMniLpNjoPYrMZfUUes3rLcBY7fJzairkM1zc");

/// Oracle Integration Module for Solana Stablecoin Standard
///
/// Provides Switchboard V2 oracle price feeds for non-USD stablecoin pegs.
/// The oracle module is **separate** from the core SSS-1/SSS-2 program —
/// it reads price data and then calls into the SSS program for mint/burn.
///
/// ## Supported Feeds
///
/// - EUR/USD, GBP/USD, BRL/USD, JPY/USD (forex pairs)
/// - CPI index (inflation-indexed stablecoins)
/// - Custom Switchboard V2 aggregators
///
/// ## Safety
///
/// - Staleness check: rejects feeds older than `max_staleness` seconds
/// - Confidence interval: rejects wide-spread prices
/// - Authority-gated: only config authority can update feed addresses
#[program]
pub mod sss_oracle {
    use super::*;

    /// Create a new oracle configuration linking a Switchboard feed
    /// to an SSS-1/SSS-2 stablecoin.
    pub fn create_oracle_config(
        ctx: Context<CreateOracleConfig>,
        params: CreateOracleParams,
    ) -> Result<()> {
        instructions::config::create_handler(ctx, params)
    }

    /// Update the Switchboard feed address for an oracle configuration.
    pub fn update_feed(
        ctx: Context<UpdateFeed>,
        new_feed: Pubkey,
    ) -> Result<()> {
        instructions::config::update_feed_handler(ctx, new_feed)
    }

    /// Toggle the oracle configuration on or off.
    pub fn toggle_oracle(
        ctx: Context<ToggleOracle>,
        enabled: bool,
    ) -> Result<()> {
        instructions::config::toggle_handler(ctx, enabled)
    }

    /// Read the current price from the oracle feed.
    /// Returns the price, confidence interval, and feed timestamp.
    pub fn read_price(ctx: Context<ReadPrice>) -> Result<()> {
        instructions::price::read_handler(ctx)
    }

    /// Mint tokens using oracle-derived exchange rate.
    ///
    /// Reads the current price from Switchboard, calculates the
    /// mint amount in USD terms, and CPIs into the SSS program.
    pub fn oracle_gated_mint(
        ctx: Context<OracleGatedMint>,
        base_amount: u64,
    ) -> Result<()> {
        instructions::price::oracle_mint_handler(ctx, base_amount)
    }

    /// Burn tokens using oracle-derived exchange rate.
    pub fn oracle_gated_burn(
        ctx: Context<OracleGatedBurn>,
        token_amount: u64,
    ) -> Result<()> {
        instructions::price::oracle_burn_handler(ctx, token_amount)
    }

    /// Propose a new authority for the oracle config (step 1).
    pub fn propose_oracle_authority(
        ctx: Context<ProposeOracleAuthority>,
        new_authority: Pubkey,
    ) -> Result<()> {
        instructions::config::propose_oracle_authority_handler(ctx, new_authority)
    }

    /// Accept the pending oracle authority transfer (step 2).
    pub fn accept_oracle_authority(ctx: Context<AcceptOracleAuthority>) -> Result<()> {
        instructions::config::accept_oracle_authority_handler(ctx)
    }
}
