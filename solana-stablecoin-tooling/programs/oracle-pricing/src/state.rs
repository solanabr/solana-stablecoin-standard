use anchor_lang::prelude::*;

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq)]
pub enum OracleProvider {
    Pyth,
    Switchboard,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq)]
pub enum BaseCurrency {
    USD, EUR, BRL, GBP, JPY, CPI, Custom,
}

/// Oracle feed configuration PDA.
/// Stores pricing parameters, validation thresholds, and circuit breaker state.
#[account]
pub struct OracleFeedConfig {
    pub authority: Pubkey,
    pub mint: Pubkey,
    pub provider: OracleProvider,
    pub feed_address: Pubkey,
    /// Expected owner program of the feed account, set at init time.
    /// Validated on every refresh/validate to prevent feed spoofing.
    pub expected_feed_owner: Pubkey,
    pub base_currency: BaseCurrency,
    pub max_staleness_secs: u64,
    pub max_deviation_bps: u16,
    /// Max confidence-to-price ratio in bps. 0 = skip check.
    pub max_confidence_bps: u16,
    /// Target peg price scaled by 10^8 (1.00 = 100_000_000)
    pub target_price: u64,
    /// Circuit breaker hard floor (scaled 10^8). 0 = disabled.
    pub circuit_breaker_min: u64,
    /// Circuit breaker hard ceiling (scaled 10^8). 0 = disabled.
    pub circuit_breaker_max: u64,
    pub last_price: u64,
    pub last_confidence: u64,
    pub last_update_ts: i64,
    pub active: bool,
    pub circuit_breaker_tripped: bool,
    pub refresh_count: u64,
    pub bump: u8,
}

impl OracleFeedConfig {
    pub const SIZE: usize = 8 + 32 + 32 + 1 + 32 + 32 + 1 +
        8 + 2 + 2 + 8 + 8 + 8 + 8 + 8 + 8 + 1 + 1 + 8 + 1 + 32;

    pub fn validate_feed_owner(&self, feed_owner: &Pubkey) -> bool {
        *feed_owner == self.expected_feed_owner
    }
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct PriceQuote {
    pub price: u64,
    pub confidence: u64,
    pub timestamp: i64,
    pub within_peg: bool,
    pub confidence_ok: bool,
    pub circuit_breaker_ok: bool,
}

pub struct PythPriceData {
    pub price: i64,
    pub confidence: u64,
    pub exponent: i32,
    pub publish_time: i64,
    pub status: u32,
}

impl PythPriceData {
    pub fn parse(data: &[u8]) -> Result<Self> {
        require!(data.len() >= 248, OracleError::InvalidFeedData);
        let o = 208;
        let price = i64::from_le_bytes(data[o..o+8].try_into().unwrap());
        let confidence = u64::from_le_bytes(data[o+8..o+16].try_into().unwrap());
        let status = u32::from_le_bytes(data[o+16..o+20].try_into().unwrap());
        let exponent = i32::from_le_bytes(data[o+24..o+28].try_into().unwrap());
        let publish_time = i64::from_le_bytes(data[o+32..o+40].try_into().unwrap());
        Ok(Self { price, confidence, exponent, publish_time, status })
    }

    pub fn is_trading(&self) -> bool { self.status == 1 }

    pub fn to_normalized_price(&self) -> u64 {
        if self.price <= 0 { return 0; }
        let p = self.price as u128;
        let te: i32 = -8;
        if self.exponent >= te {
            (p * 10u128.pow((self.exponent - te) as u32)) as u64
        } else {
            (p / 10u128.pow((te - self.exponent) as u32)) as u64
        }
    }

    pub fn to_normalized_confidence(&self) -> u64 {
        let c = self.confidence as u128;
        let te: i32 = -8;
        if self.exponent >= te {
            (c * 10u128.pow((self.exponent - te) as u32)) as u64
        } else {
            (c / 10u128.pow((te - self.exponent) as u32)) as u64
        }
    }
}

pub struct SwitchboardResult {
    pub result: f64,
    pub timestamp: i64,
}

impl SwitchboardResult {
    pub fn parse(data: &[u8]) -> Result<Self> {
        require!(data.len() >= 200, OracleError::InvalidFeedData);
        let result = f64::from_le_bytes(data[112..120].try_into().unwrap());
        let timestamp = i64::from_le_bytes(data[120..128].try_into().unwrap());
        require!(result.is_finite() && result > 0.0, OracleError::InvalidFeedData);
        Ok(Self { result, timestamp })
    }

    pub fn to_normalized_price(&self) -> u64 {
        (self.result * 100_000_000.0) as u64
    }
}

#[error_code]
pub enum OracleError {
    #[msg("Oracle feed data is invalid")]
    InvalidFeedData,
    #[msg("Feed account owner does not match expected oracle program")]
    InvalidFeedOwner,
    #[msg("Oracle price is stale")]
    StalePrice,
    #[msg("Price deviation exceeds maximum")]
    PriceDeviationExceeded,
    #[msg("Confidence interval too wide")]
    ConfidenceTooWide,
    #[msg("Oracle is not active")]
    OracleInactive,
    #[msg("Circuit breaker tripped")]
    CircuitBreakerTripped,
    #[msg("Pyth feed not in trading status")]
    PythNotTrading,
    #[msg("Unauthorized")]
    Unauthorized,
    #[msg("Arithmetic overflow")]
    Overflow,
}
