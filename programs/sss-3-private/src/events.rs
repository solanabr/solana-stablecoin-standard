use anchor_lang::prelude::*;

/// Emitted when a new SSS-3 private stablecoin is initialized
#[event]
pub struct InitializePrivateEvent {
    pub state: Pubkey,
    pub mint: Pubkey,
    pub authority: Pubkey,
    pub name: String,
    pub symbol: String,
    pub decimals: u8,
    pub auditor_elgamal_pubkey: [u8; 32],
    pub timestamp: i64,
}

/// Emitted when an address is approved for confidential transfers
#[event]
pub struct AllowlistApprovedEvent {
    pub state: Pubkey,
    pub wallet: Pubkey,
    pub kyc_provider: String,
    pub approved_by: Pubkey,
    pub timestamp: i64,
}

/// Emitted when an address is revoked from the confidential transfer allowlist
#[event]
pub struct AllowlistRevokedEvent {
    pub state: Pubkey,
    pub wallet: Pubkey,
    pub reason: String,
    pub revoked_by: Pubkey,
    pub timestamp: i64,
}

/// Emitted when tokens are deposited from public to confidential balance
#[event]
pub struct DepositToConfidentialEvent {
    pub state: Pubkey,
    pub wallet: Pubkey,
    pub amount: u64,
    pub timestamp: i64,
}

/// Emitted when tokens are withdrawn from confidential to public balance
#[event]
pub struct WithdrawToPublicEvent {
    pub state: Pubkey,
    pub wallet: Pubkey,
    pub amount: u64,
    pub timestamp: i64,
}

/// Emitted when the stablecoin is paused
#[event]
pub struct PausedEvent {
    pub state: Pubkey,
    pub paused_by: Pubkey,
    pub timestamp: i64,
}

/// Emitted when the stablecoin is unpaused
#[event]
pub struct UnpausedEvent {
    pub state: Pubkey,
    pub unpaused_by: Pubkey,
    pub timestamp: i64,
}

/// Emitted when authority transfer is proposed or accepted
#[event]
pub struct AuthorityUpdatedEvent {
    pub state: Pubkey,
    pub old_authority: Pubkey,
    pub new_authority: Pubkey,
    pub timestamp: i64,
}

/// Emitted when tokens are minted
#[event]
pub struct MintedEvent {
    pub state: Pubkey,
    pub recipient: Pubkey,
    pub amount: u64,
    pub minted_by: Pubkey,
    pub timestamp: i64,
}

/// Emitted when tokens are burned
#[event]
pub struct BurnedEvent {
    pub state: Pubkey,
    pub from: Pubkey,
    pub amount: u64,
    pub burned_by: Pubkey,
    pub timestamp: i64,
}

/// Emitted when the auditor ElGamal key is updated
#[event]
pub struct AuditorUpdatedEvent {
    pub state: Pubkey,
    pub old_auditor_key: [u8; 32],
    pub new_auditor_key: [u8; 32],
    pub updated_by: Pubkey,
    pub timestamp: i64,
}
