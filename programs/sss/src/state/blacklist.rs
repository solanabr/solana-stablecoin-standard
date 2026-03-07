use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace)]
pub struct BlacklistedEntry {
    pub bump: u8,
    pub is_blacklisted: bool,
    #[max_len(100)]
    pub reason: String,
}