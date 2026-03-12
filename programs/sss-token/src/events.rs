use anchor_lang::prelude::*;

#[event]
pub struct StablecoinInitialized {
    pub config: Pubkey,
    pub mint: Pubkey,
    pub master_authority: Pubkey,
    pub name: String,
    pub symbol: String,
    pub preset: u8,
    pub timestamp: i64,
}

#[event]
pub struct TokensMinted {
    pub config: Pubkey,
    pub minter: Pubkey,
    pub recipient: Pubkey,
    pub amount: u64,
    pub total_minted: u64,
    pub timestamp: i64,
}

#[event]
pub struct TokensBurned {
    pub config: Pubkey,
    pub burner: Pubkey,
    pub from: Pubkey,
    pub amount: u64,
    pub total_burned: u64,
    pub timestamp: i64,
}

#[event]
pub struct AccountFrozen {
    pub config: Pubkey,
    pub authority: Pubkey,
    pub target_account: Pubkey,
    pub timestamp: i64,
}

#[event]
pub struct AccountThawed {
    pub config: Pubkey,
    pub authority: Pubkey,
    pub target_account: Pubkey,
    pub timestamp: i64,
}

#[event]
pub struct ProgramPaused {
    pub config: Pubkey,
    pub pauser: Pubkey,
    pub timestamp: i64,
}

#[event]
pub struct ProgramUnpaused {
    pub config: Pubkey,
    pub pauser: Pubkey,
    pub timestamp: i64,
}

#[event]
pub struct RoleUpdated {
    pub config: Pubkey,
    pub role: String,
    pub old_holder: Pubkey,
    pub new_holder: Pubkey,
    pub updated_by: Pubkey,
    pub timestamp: i64,
}

#[event]
pub struct MinterUpdated {
    pub config: Pubkey,
    pub minter: Pubkey,
    pub is_active: bool,
    pub mint_quota: u64,
    pub updated_by: Pubkey,
    pub timestamp: i64,
}

#[event]
pub struct AuthorityTransferred {
    pub config: Pubkey,
    pub old_authority: Pubkey,
    pub new_authority: Pubkey,
    pub timestamp: i64,
}

#[event]
pub struct AuthorityNominated {
    pub config: Pubkey,
    pub old_authority: Pubkey,
    pub nominated_authority: Pubkey,
    pub timestamp: i64,
}

#[event]
pub struct BlacklistAdded {
    pub config: Pubkey,
    pub blocked_address: Pubkey,
    pub reason: String,
    pub blacklisted_by: Pubkey,
    pub timestamp: i64,
}

#[event]
pub struct BlacklistRemoved {
    pub config: Pubkey,
    pub unblocked_address: Pubkey,
    pub removed_by: Pubkey,
    pub timestamp: i64,
}

#[event]
pub struct AllowlistAdded {
    pub config: Pubkey,
    pub address: Pubkey,
    pub added_by: Pubkey,
    pub reason: String,
    pub timestamp: i64,
}

#[event]
pub struct AllowlistRemoved {
    pub config: Pubkey,
    pub address: Pubkey,
    pub removed_by: Pubkey,
    pub timestamp: i64,
}

#[event]
pub struct TokensSeized {
    pub config: Pubkey,
    pub from: Pubkey,
    pub amount: u64,
    pub seized_by: Pubkey,
    pub timestamp: i64,
}

#[event]
pub struct AuditLogRecorded {
    pub config: Pubkey,
    pub index: u64,
    pub action: u8,
    pub actor: Pubkey,
    pub timestamp: i64,
}

#[event]
pub struct SupplyCapUpdated {
    pub config: Pubkey,
    pub old_cap: u64,
    pub new_cap: u64,
    pub timestamp: i64,
}

#[event]
pub struct MetadataUpdated {
    pub config: Pubkey,
    pub timestamp: i64,
}
