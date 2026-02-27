use anchor_lang::prelude::*;

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug)]
pub enum AuditAction {
    Mint,
    Burn,
    Freeze,
    Thaw,
    Pause,
    Unpause,
    BlacklistAdd,
    BlacklistRemove,
    Seize,
    RoleUpdate,
    MinterUpdate,
    AuthorityTransfer,
    ReserveAttestation,
}

#[account]
pub struct AuditLogEntry {
    pub bump: u8,
    pub config: Pubkey,
    pub index: u64,
    pub action: AuditAction,
    pub actor: Pubkey,
    pub target: Option<Pubkey>,
    pub amount: Option<u64>,
    pub details: String, // max 256
    pub timestamp: i64,
}

impl AuditLogEntry {
    pub const MAX_DETAILS_LEN: usize = 256;
    pub const SEED_PREFIX: &'static [u8] = b"audit";

    // 8 + 1 + 32 + 8 + 1 + 32 + (1 + 32) + (1 + 8) + (4 + 256) + 8
    pub const SPACE: usize = 8 + 1 + 32 + 8 + 1 + 32 + (1 + 32) + (1 + 8) + (4 + 256) + 8;
}
