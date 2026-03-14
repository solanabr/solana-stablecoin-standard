/// PDA seed for StablecoinConfig account
pub const CONFIG_SEED: &[u8] = b"config";

/// PDA seed for RoleAssignment account
pub const ROLE_SEED: &[u8] = b"role";

/// PDA seed for MinterQuota account
pub const QUOTA_SEED: &[u8] = b"quota";

/// PDA seed for BlacklistEntry account
pub const BLACKLIST_SEED: &[u8] = b"blacklist";

/// PDA seed for AllowlistEntry account
pub const ALLOWLIST_SEED: &[u8] = b"allowlist";

/// PDA seed for OracleConfig account
pub const ORACLE_CONFIG_SEED: &[u8] = b"oracle";

/// Role byte constants
pub const ROLE_ADMIN: u8 = 0;
pub const ROLE_MINTER: u8 = 1;
pub const ROLE_PAUSER: u8 = 2;
pub const ROLE_FREEZER: u8 = 3;
pub const ROLE_BLACKLISTER: u8 = 4;
pub const ROLE_SEIZER: u8 = 5;

/// Maximum name length for token metadata
pub const MAX_NAME_LEN: usize = 32;

/// Maximum symbol length for token metadata
pub const MAX_SYMBOL_LEN: usize = 10;

/// Maximum URI length for token metadata
pub const MAX_URI_LEN: usize = 200;

/// Maximum reason length for blacklist entries
pub const MAX_REASON_LEN: usize = 128;

/// Default decimals for stablecoin
pub const DEFAULT_DECIMALS: u8 = 6;

/// Maximum minter quota (u64::MAX means unlimited)
pub const UNLIMITED_QUOTA: u64 = u64::MAX;
