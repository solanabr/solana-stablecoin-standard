use anchor_lang::prelude::*;

#[account]
pub struct OraclePriceConfig {
    /// Authority who can update this config
    pub authority: Pubkey,
    /// Pyth/Switchboard price feed account address
    pub price_feed: Pubkey,
    /// Maximum deviation from expected price in basis points
    pub max_deviation_bps: u16,
    /// Maximum feed age in seconds before considered stale
    pub max_staleness_secs: u64,
    /// Expected price in scaled integer form
    pub expected_price: u64,
    /// Number of decimals in expected_price
    pub price_decimals: u8,
    /// Whether oracle validation is active
    pub enabled: bool,
    /// Last price that passed validation
    pub last_validated_price: u64,
    /// Timestamp of last successful validation
    pub last_validated_at: i64,
    /// PDA bump seed
    pub bump: u8,
}

impl OraclePriceConfig {
    // 8 (discriminator) + 32 + 32 + 2 + 8 + 8 + 1 + 1 + 8 + 8 + 1 = 109
    pub const LEN: usize = 8 + 32 + 32 + 2 + 8 + 8 + 1 + 1 + 8 + 8 + 1;
}
