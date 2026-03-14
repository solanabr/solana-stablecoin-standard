use anchor_lang::prelude::*;

/// Supported oracle providers
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug, PartialEq, Eq)]
pub enum OracleProvider {
    /// Pyth Network price feeds
    Pyth,
    /// Switchboard V2 aggregator feeds
    Switchboard,
}

/// Oracle configuration stored alongside the stablecoin config.
/// Enables price-gated minting for non-USD pegged stablecoins.
///
/// Example use cases:
/// - BRL stablecoin that mints based on USD/BRL feed
/// - EUR stablecoin that mints based on USD/EUR feed
/// - Gold-backed token using XAU/USD feed
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct OracleConfig {
    /// The stablecoin config this oracle is associated with
    pub config: Pubkey,

    /// Oracle provider type
    pub provider: OracleProvider,

    /// Address of the price feed account (Pyth price account or Switchboard aggregator)
    pub feed_address: Pubkey,

    /// Expected price in scaled integer form (e.g., 5_200_000 for BRL/USD at 5.20, with 6 decimals)
    pub expected_price: u64,

    /// Number of decimals in expected_price (typically 6)
    pub price_decimals: u8,

    /// Maximum staleness in seconds (override of default)
    pub max_staleness: i64,

    /// Maximum deviation from expected price in basis points (override of default)
    pub max_deviation_bps: u64,

    /// Whether oracle checks are enforced (can be disabled in emergency)
    pub enabled: bool,

    /// PDA bump
    pub bump: u8,
}

impl OracleConfig {
    /// Account size for rent calculation
    pub const LEN: usize = 8  // discriminator
        + 32  // config
        + 1   // provider (enum)
        + 32  // feed_address
        + 8   // expected_price
        + 1   // price_decimals
        + 8   // max_staleness
        + 8   // max_deviation_bps
        + 1   // enabled
        + 1   // bump
        + 64; // _reserved
}

/// Parsed price data from an oracle feed (provider-agnostic)
#[derive(Clone, Debug)]
pub struct PriceData {
    /// Price in scaled integer form
    pub price: i64,
    /// Confidence interval (± range)
    pub confidence: u64,
    /// Number of decimals in the price (negative exponent)
    pub exponent: i32,
    /// Unix timestamp of the price update
    pub publish_time: i64,
}

impl PriceData {
    /// Convert price to a u64 scaled to the given number of decimals.
    /// Returns None if price is negative or overflow occurs.
    pub fn to_scaled_u64(&self, target_decimals: u8) -> Option<u64> {
        if self.price <= 0 {
            return None;
        }

        let price = self.price as u64;
        let expo = self.exponent;

        // Price is: price * 10^exponent
        // We want: result * 10^(-target_decimals)
        // So: result = price * 10^(exponent + target_decimals)
        let shift = expo + target_decimals as i32;

        if shift >= 0 {
            price.checked_mul(10u64.checked_pow(shift as u32)?)
        } else {
            let divisor = 10u64.checked_pow((-shift) as u32)?;
            Some(price / divisor)
        }
    }
}
