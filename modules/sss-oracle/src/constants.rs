/// PDA seed for oracle configuration
pub const ORACLE_CONFIG_SEED: &[u8] = b"oracle-config";

/// Maximum acceptable price feed staleness (seconds).
/// Feeds older than this are considered stale and should be rejected.
pub const MAX_STALENESS_SECONDS: i64 = 60;

/// Maximum deviation from expected price before minting is blocked (basis points).
/// 500 = 5% deviation tolerance.
pub const MAX_DEVIATION_BPS: u64 = 500;

/// Basis point denominator (10000 = 100%).
pub const BPS_DENOMINATOR: u64 = 10_000;

/// Minimum confidence ratio (confidence / price) in basis points.
/// If confidence is too wide relative to price, reject the feed.
/// 200 = 2% max confidence-to-price ratio.
pub const MAX_CONFIDENCE_RATIO_BPS: u64 = 200;
