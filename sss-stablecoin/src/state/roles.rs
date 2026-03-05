use anchor_lang::prelude::*;

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct MinterEntry {
    pub address: Pubkey,
    pub quota: u64,
    pub minted: u64,
}

#[account]
pub struct RoleRegistry {
    pub config: Pubkey,
    pub master: Pubkey,
    pub minters: Vec<MinterEntry>,
    pub burners: Vec<Pubkey>,
    pub pausers: Vec<Pubkey>,
    pub blacklisters: Vec<Pubkey>,
    pub seizers: Vec<Pubkey>,
    pub bump: u8,
}

impl RoleRegistry {
    pub const SEED_PREFIX: &'static str = "role_registry";
    pub const MAX_MINTERS: usize = 32;
    pub const MAX_BURNERS: usize = 32;
    pub const MAX_PAUSERS: usize = 32;
    pub const MAX_BLACKLISTERS: usize = 32;
    pub const MAX_SEIZERS: usize = 32;

    pub const LEN: usize = 32
        + 32
        + 4
        + (Self::MAX_MINTERS * (32 + 8 + 8))
        + 4
        + (Self::MAX_BURNERS * 32)
        + 4
        + (Self::MAX_PAUSERS * 32)
        + 4
        + (Self::MAX_BLACKLISTERS * 32)
        + 4
        + (Self::MAX_SEIZERS * 32)
        + 1;
}
