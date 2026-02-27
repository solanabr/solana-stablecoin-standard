use anchor_lang::prelude::*;

/// Enumerates all auditable actions in the SSS stablecoin system.
/// Used by both the on-chain `AuditLogEntry` account type and the
/// Anchor event types in `events.rs`.
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

/// On-chain audit log entry account — **reserved for optional use**.
///
/// The primary audit trail for SSS stablecoins is implemented via Anchor events
/// (see `events.rs`), which are emitted on every state-changing operation and can
/// be indexed off-chain via `getTransaction` logs or the SDK's `parseTransactionEvents`.
///
/// This account type is provided for issuers who require **on-chain audit persistence**
/// (e.g., for regulatory proof that cannot rely on RPC log availability). Creating a
/// PDA per operation incurs rent costs (~0.003 SOL per entry), so it is opt-in.
///
/// Seeds: `["audit", config, index (u64 LE)]`
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
