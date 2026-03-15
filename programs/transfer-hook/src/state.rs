use anchor_lang::prelude::*;

/// Mirrors the StablecoinConfig from the stablecoin program for safe Borsh deserialization.
/// Layout must exactly match the stablecoin program's StablecoinConfig field order.
/// Used instead of raw byte offsets so that any future layout changes cause a compile
/// error or deserialization failure rather than silently reading the wrong byte.
#[account]
pub struct StablecoinConfigRef {
    pub master_authority: Pubkey,
    pub pending_authority: Pubkey,
    pub mint: Pubkey,
    pub decimals: u8,
    pub enable_permanent_delegate: bool,
    pub enable_transfer_hook: bool,
    pub is_paused: bool,
    pub total_minted: u64,
    pub total_burned: u64,
    pub bump: u8,
    pub enable_confidential_transfer: bool,
    pub enable_allowlist: bool,
}
