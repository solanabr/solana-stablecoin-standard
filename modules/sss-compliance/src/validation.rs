use anchor_lang::prelude::*;
use crate::constants::*;

/// Check if an address is blacklisted by verifying if the blacklist PDA exists
pub fn is_blacklisted(
    config: &Pubkey,
    address: &Pubkey,
    program_id: &Pubkey,
) -> (Pubkey, u8) {
    Pubkey::find_program_address(
        &[BLACKLIST_SEED, config.as_ref(), address.as_ref()],
        program_id,
    )
}

/// Derive the role assignment PDA
pub fn get_role_address(
    role: u8,
    holder: &Pubkey,
    program_id: &Pubkey,
) -> (Pubkey, u8) {
    Pubkey::find_program_address(
        &[ROLE_SEED, &[role], holder.as_ref()],
        program_id,
    )
}

/// Derive the config PDA
pub fn get_config_address(
    mint: &Pubkey,
    program_id: &Pubkey,
) -> (Pubkey, u8) {
    Pubkey::find_program_address(
        &[CONFIG_SEED, mint.as_ref()],
        program_id,
    )
}

/// Derive the quota PDA
pub fn get_quota_address(
    config: &Pubkey,
    minter: &Pubkey,
    program_id: &Pubkey,
) -> (Pubkey, u8) {
    Pubkey::find_program_address(
        &[QUOTA_SEED, config.as_ref(), minter.as_ref()],
        program_id,
    )
}

/// Check if minter has remaining quota
pub fn check_quota(
    minted_amount: u64,
    quota_limit: u64,
    mint_amount: u64,
) -> bool {
    if quota_limit == u64::MAX {
        return true; // unlimited
    }
    match minted_amount.checked_add(mint_amount) {
        Some(new_total) => new_total <= quota_limit,
        None => false,
    }
}
