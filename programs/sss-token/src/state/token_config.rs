use anchor_lang::prelude::*;

/// Preset variants. Stored as u8 on-chain so we can match without importing enums in clients.
///   1 = SSS-1 (Minimal)  — mint/freeze authority, metadata, basic role management
///   2 = SSS-2 (Compliant) — adds permanent delegate, transfer hook, blacklist, seizure
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq)]
#[repr(u8)]
pub enum Preset {
    Sss1 = 1,
    Sss2 = 2,
}

impl Preset {
    pub fn is_compliant(&self) -> bool {
        matches!(self, Preset::Sss2)
    }
}

/// Core on-chain config for every SSS token. One per mint.
/// PDA seeds: [b"sss_config", mint.key().as_ref()]
#[account]
pub struct TokenConfig {
    /// Bump seed for PDA derivation
    pub bump: u8,

    /// 1 = SSS-1, 2 = SSS-2
    pub preset: u8,

    /// Mint this config governs
    pub mint: Pubkey,

    /// Hard cap on supply. 0 = unlimited.
    pub supply_cap: u64,

    /// True when all mint/burn/transfer ops are blocked
    pub paused: bool,

    /// Decimals (cached from mint for convenience)
    pub decimals: u8,

    /// Admin who deployed — can reassign roles but not unilaterally mint
    pub deployer: Pubkey,

    /// Transfer hook program (only set for SSS-2)
    pub transfer_hook_program: Pubkey,

    /// Slot when this config was created
    pub created_at: u64,

    /// Reserved for future fields without realloc
    pub _reserved: [u8; 128],
}

impl TokenConfig {
    /// Fixed account size. 8 (discriminator) + fields.
    pub const LEN: usize = 8 + 1 + 1 + 32 + 8 + 1 + 1 + 32 + 32 + 8 + 128;

    pub fn preset_enum(&self) -> Option<Preset> {
        match self.preset {
            1 => Some(Preset::Sss1),
            2 => Some(Preset::Sss2),
            _ => None,
        }
    }
}
