pub const STABLECOIN_SEED: &[u8] = b"stablecoin";
pub const MINTER_RECORD_SEED: &[u8] = b"minter_record";
pub const BLACKLIST_SEED: &[u8] = b"blacklist";

/// Max length for stablecoin name
pub const MAX_NAME_LEN: usize = 64;
/// Max symbol length
pub const MAX_SYMBOL_LEN: usize = 16;
/// Max URI length
pub const MAX_URI_LEN: usize = 256;
/// Max blacklist reason string
pub const MAX_REASON_LEN: usize = 128;
/// Minimum decimals allowed
pub const MIN_DECIMALS: u8 = 0;
/// Maximum decimals allowed  
pub const MAX_DECIMALS: u8 = 9;
