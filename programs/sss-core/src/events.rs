use anchor_lang::prelude::*;

#[event]
pub struct StablecoinInitialized {
    pub config: Pubkey,
    pub authority: Pubkey,
    pub mint: Pubkey,
    pub name: String,
    pub symbol: String,
    pub decimals: u8,
    pub compliance_enabled: bool,
    pub enable_allowlist: bool,
    pub supply_cap: u64,
}

#[event]
pub struct TokensMinted {
    pub config: Pubkey,
    pub minter: Pubkey,
    pub recipient: Pubkey,
    pub amount: u64,
}

#[event]
pub struct TokensBurned {
    pub config: Pubkey,
    pub burner: Pubkey,
    pub amount: u64,
}

#[event]
pub struct AccountFrozen {
    pub config: Pubkey,
    pub target: Pubkey,
    pub freezer: Pubkey,
}

#[event]
pub struct AccountThawed {
    pub config: Pubkey,
    pub target: Pubkey,
    pub freezer: Pubkey,
}

#[event]
pub struct StablecoinPaused {
    pub config: Pubkey,
    pub pauser: Pubkey,
}

#[event]
pub struct StablecoinUnpaused {
    pub config: Pubkey,
    pub pauser: Pubkey,
}

#[event]
pub struct AuthorityTransferred {
    pub config: Pubkey,
    pub previous_authority: Pubkey,
    pub new_authority: Pubkey,
}

#[event]
pub struct RoleGranted {
    pub config: Pubkey,
    pub role: u8,
    pub holder: Pubkey,
    pub grantor: Pubkey,
}

#[event]
pub struct RoleRevoked {
    pub config: Pubkey,
    pub role: u8,
    pub holder: Pubkey,
    pub revoker: Pubkey,
}

#[event]
pub struct QuotaSet {
    pub config: Pubkey,
    pub minter: Pubkey,
    pub quota_limit: u64,
}

#[event]
pub struct AddressBlacklisted {
    pub config: Pubkey,
    pub address: Pubkey,
    pub blacklister: Pubkey,
    pub reason: String,
}

#[event]
pub struct AddressUnblacklisted {
    pub config: Pubkey,
    pub address: Pubkey,
    pub blacklister: Pubkey,
}

#[event]
pub struct TokensSeized {
    pub config: Pubkey,
    pub from: Pubkey,
    pub to: Pubkey,
    pub amount: u64,
    pub seizer: Pubkey,
}

#[event]
pub struct AuthorityProposed {
    pub config: Pubkey,
    pub current_authority: Pubkey,
    pub proposed_authority: Pubkey,
}

#[event]
pub struct AuthorityTransferCancelled {
    pub config: Pubkey,
    pub authority: Pubkey,
}

#[event]
pub struct MetadataUpdated {
    pub config: Pubkey,
    pub mint: Pubkey,
    pub field: String,
    pub value: String,
}

#[event]
pub struct SupplyCapUpdated {
    pub config: Pubkey,
    pub old_cap: u64,
    pub new_cap: u64,
}

#[event]
pub struct AllowlistAdded {
    pub config: Pubkey,
    pub address: Pubkey,
    pub added_by: Pubkey,
}

#[event]
pub struct AllowlistRemoved {
    pub config: Pubkey,
    pub address: Pubkey,
    pub removed_by: Pubkey,
}

#[event]
pub struct OracleConfigured {
    pub config: Pubkey,
    pub price_feed: Pubkey,
    pub max_deviation_bps: u16,
    pub max_staleness_secs: u64,
    pub enabled: bool,
}
