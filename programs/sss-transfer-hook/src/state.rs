use anchor_lang::prelude::*;

/// HookConfig PDA: seeds = [b"hook_config", mint.as_ref()]
#[account]
pub struct HookConfig {
    pub authority: Pubkey,    // sss-core config PDA (the only entity that can manage blacklists)
    pub mint: Pubkey,
    pub bump: u8,
}

impl HookConfig {
    pub const LEN: usize = 8 + 32 + 32 + 1; // discriminator + authority + mint + bump
}

/// BlacklistEntry PDA: seeds = [b"blacklist", hook_config.as_ref(), wallet.as_ref()]
#[account]
pub struct BlacklistEntry {
    pub config: Pubkey,       // hook_config key
    pub wallet: Pubkey,
    pub blacklisted_at: i64,
    pub bump: u8,
}

impl BlacklistEntry {
    pub const LEN: usize = 8 + 32 + 32 + 8 + 1; // discriminator + config + wallet + timestamp + bump
}
