use anchor_lang::prelude::*;

/// Stores the oracle feed configuration for a stablecoin mint.
/// PDA seeds: ["price_feed", mint.as_ref()]
#[account]
pub struct PriceFeedConfig {
    /// Authority that can update this feed config
    pub authority: Pubkey,
    /// Stablecoin mint this feed prices
    pub mint: Pubkey,
    /// Switchboard aggregator account address
    pub feed: Pubkey,
    /// Display name for the feed (e.g. "BRL/USD")
    pub pair_name: String,
    /// Decimal precision for the price (e.g. 6 → price * 10^6)
    pub feed_decimals: u8,
    /// Maximum age in seconds before price is considered stale
    pub stale_after_secs: i64,
    /// PDA bump
    pub bump: u8,
}

impl PriceFeedConfig {
    pub const MAX_PAIR_NAME: usize = 16;
    pub const SIZE: usize = 8     // discriminator
        + 32    // authority
        + 32    // mint
        + 32    // feed
        + (4 + Self::MAX_PAIR_NAME)  // pair_name (string)
        + 1     // feed_decimals
        + 8     // stale_after_secs
        + 1;    // bump
}
