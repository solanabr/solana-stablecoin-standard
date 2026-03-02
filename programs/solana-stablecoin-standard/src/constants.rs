/// Seeds for PDA derivation
pub const STABLECOIN_CONFIG_SEED: &[u8] = b"stablecoin-config";
pub const ROLES_CONFIG_SEED: &[u8] = b"roles-config";
pub const BLACKLIST_SEED: &[u8] = b"blacklist";
pub const AUDIT_LOG_SEED: &[u8] = b"audit";

/// Default token decimals (matches USDC)
pub const DEFAULT_DECIMALS: u8 = 6;

/// Maximum token name length
pub const MAX_NAME_LEN: usize = 32;

/// Maximum token symbol length
pub const MAX_SYMBOL_LEN: usize = 10;

/// Maximum URI length
pub const MAX_URI_LEN: usize = 200;
