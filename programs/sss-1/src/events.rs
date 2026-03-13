use anchor_lang::prelude::*;

#[event]
pub struct StablecoinInitialized {
    pub config: Pubkey,
    pub admin: Pubkey,
    pub mint: Pubkey,
    pub name: String,
    pub symbol: String,
    pub decimals: u8,
}

#[event]
pub struct RoleGranted {
    pub config: Pubkey,
    pub authority: Pubkey,
    pub role_type: u8,
    pub granted_by: Pubkey,
}

#[event]
pub struct RoleRevoked {
    pub config: Pubkey,
    pub authority: Pubkey,
    pub role_type: u8,
    pub revoked_by: Pubkey,
}

#[event]
pub struct TokensMinted {
    pub config: Pubkey,
    pub minter: Pubkey,
    pub destination: Pubkey,
    pub amount: u64,
}

#[event]
pub struct TokensBurned {
    pub config: Pubkey,
    pub burner: Pubkey,
    pub source: Pubkey,
    pub amount: u64,
}

#[event]
pub struct AccountFrozen {
    pub config: Pubkey,
    pub freezer: Pubkey,
    pub account: Pubkey,
}

#[event]
pub struct AccountUnfrozen {
    pub config: Pubkey,
    pub freezer: Pubkey,
    pub account: Pubkey,
}

#[event]
pub struct MetadataUpdated {
    pub config: Pubkey,
    pub admin: Pubkey,
    pub field: String,
    pub value: String,
}

#[event]
pub struct StablecoinPaused {
    pub config: Pubkey,
    pub admin: Pubkey,
}

#[event]
pub struct StablecoinUnpaused {
    pub config: Pubkey,
    pub admin: Pubkey,
}

#[event]
pub struct AdminTransferred {
    pub config: Pubkey,
    pub previous_admin: Pubkey,
    pub new_admin: Pubkey,
}

#[event]
pub struct TokensSeized {
    pub config: Pubkey,
    pub admin: Pubkey,
    pub from: Pubkey,
    pub to: Pubkey,
    pub amount: u64,
}

#[event]
pub struct HookInitialized {
    pub hook_config: Pubkey,
    pub authority: Pubkey,
    pub mint: Pubkey,
}

#[event]
pub struct AddressBlacklisted {
    pub hook_config: Pubkey,
    pub address: Pubkey,
    pub blacklisted_by: Pubkey,
}

#[event]
pub struct AddressRemovedFromBlacklist {
    pub hook_config: Pubkey,
    pub address: Pubkey,
    pub removed_by: Pubkey,
}

#[event]
pub struct ComplianceModeUpdated {
    pub hook_config: Pubkey,
    pub updated_by: Pubkey,
    pub compliance_enabled: bool,
}

#[event]
pub struct HookAuthorityTransferred {
    pub hook_config: Pubkey,
    pub previous_authority: Pubkey,
    pub new_authority: Pubkey,
}
