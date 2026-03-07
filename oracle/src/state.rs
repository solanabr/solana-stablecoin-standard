use anchor_lang::prelude::*;

// ─── Oracle Config ───────────────────────────────────────────────────────────

/// On-chain configuration linking a Switchboard feed to an SSS stablecoin.
///
/// Seeds: `["oracle-config", stablecoin_state.key()]`
#[account]
#[derive(Debug)]
pub struct OracleConfig {
    /// Authority who can manage this oracle configuration
    pub authority: Pubkey,
    /// The SSS-1/SSS-2 stablecoin state PDA
    pub stablecoin_state: Pubkey,
    /// The stablecoin mint
    pub mint: Pubkey,
    /// Switchboard V2 aggregator address (the price feed)
    pub feed_address: Pubkey,
    /// Base currency code (e.g., "EUR", "BRL", "GBP", "CPI")
    pub base_currency: String,
    /// Maximum feed age in seconds before rejecting
    pub max_staleness: i64,
    /// Maximum confidence interval in basis points (100 = 1%)
    pub max_confidence_bps: u64,
    /// Whether the oracle is currently active
    pub enabled: bool,
    /// Reference value for CPI-indexed stablecoins (0 for forex)
    pub reference_value: u64,
    /// Last observed price (scaled to 8 decimals, e.g., 1_08000000 = 1.08)
    pub last_price: u64,
    /// Last feed read timestamp
    pub last_read_at: i64,
    /// Total number of oracle-gated mints
    pub total_oracle_mints: u64,
    /// Total number of oracle-gated burns
    pub total_oracle_burns: u64,
    /// Bump seed
    pub bump: u8,
}

impl OracleConfig {
    pub const SIZE: usize = 8    // discriminator
        + 32                       // authority
        + 32                       // stablecoin_state
        + 32                       // mint
        + 32                       // feed_address
        + (4 + 8)                  // base_currency (max 8 chars like "CPI-USD")
        + 8                        // max_staleness
        + 8                        // max_confidence_bps
        + 1                        // enabled
        + 8                        // reference_value
        + 8                        // last_price
        + 8                        // last_read_at
        + 8                        // total_oracle_mints
        + 8                        // total_oracle_burns
        + 1;                       // bump
}

// ─── Price Data ──────────────────────────────────────────────────────────────

/// Parsed price data from a Switchboard V2 aggregator.
///
/// This is NOT an on-chain account — it's a helper struct used
/// to return parsed data from the feed.
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct PriceData {
    /// Latest price value (scaled to 8 decimals)
    pub value: u64,
    /// Confidence interval (scaled to 8 decimals)
    pub confidence: u64,
    /// Unix timestamp of the latest round
    pub timestamp: i64,
    /// Number of oracles that responded
    pub num_oracles: u32,
}

impl PriceData {
    /// Price decimals (8 for Switchboard default)
    pub const DECIMALS: u8 = 8;
    pub const SCALE: u64 = 100_000_000; // 10^8
}
