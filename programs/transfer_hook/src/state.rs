use anchor_lang::prelude::*;

#[account]
pub struct BlacklistRecord {
    pub bump: u8,
}

impl BlacklistRecord {
    pub const SEED: &'static [u8] = b"blacklist";
}