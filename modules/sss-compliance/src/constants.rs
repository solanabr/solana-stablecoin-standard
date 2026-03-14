/// PDA seed for blacklist entries
pub const BLACKLIST_SEED: &[u8] = b"blacklist";

/// PDA seed for role assignments
pub const ROLE_SEED: &[u8] = b"role";

/// PDA seed for config
pub const CONFIG_SEED: &[u8] = b"config";

/// PDA seed for minter quotas
pub const QUOTA_SEED: &[u8] = b"quota";

/// Role byte constants
pub const ROLE_ADMIN: u8 = 0;
pub const ROLE_MINTER: u8 = 1;
pub const ROLE_PAUSER: u8 = 2;
pub const ROLE_FREEZER: u8 = 3;
pub const ROLE_BLACKLISTER: u8 = 4;
pub const ROLE_SEIZER: u8 = 5;
