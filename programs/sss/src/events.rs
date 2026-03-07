use anchor_lang::prelude::*;

#[event]
pub struct AddToBlacklistEvent {
    pub blacklisted: Pubkey,
    pub mint: Pubkey,
    pub reason: String,
}

#[event]
pub struct BurnTokensEvent {
    pub burner: Pubkey,
    pub mint: Pubkey,
    pub from: Pubkey,
    pub amount: u64,
}

#[event]
pub struct FreezeAccountEvent {
    pub ata_to_freeze: Pubkey,
    pub mint: Pubkey,
}

#[event]
pub struct InitializeEvent {
    pub mint: Pubkey,
    pub standard: String,
    pub name: String,
    pub symbol: String,
    pub uri: String,
    pub decimals: u8,
    pub enable_permanent_delegate: bool,
    pub enable_transfer_hook: bool,
    pub default_account_frozen: bool,
}

#[event]
pub struct MintTokensEvent {
    pub minter: Pubkey,
    pub to: Pubkey,
    pub mint: Pubkey,
    pub amount: u64,
}

#[event]
pub struct PauseEvent {
    pub pauser: Pubkey,
    pub mint: Pubkey,
}

#[event]
pub struct RemoveFromBlacklistEvent {
    pub wallet: Pubkey,
    pub mint: Pubkey,
}

#[event]
pub struct SeizeEvent {
    pub seizer: Pubkey,
    pub from: Pubkey,
    pub to: Pubkey,
    pub mint: Pubkey,
}

#[event]
pub struct ThawAccountEvent {
    pub master: Pubkey,
    pub ata_to_thaw: Pubkey,
    pub mint: Pubkey,
}

#[event]
pub struct TransferAuthorityEvent {
    pub master: Pubkey,
    pub new_master: Pubkey,
    pub mint: Pubkey,
}

#[event]
pub struct UnpauseEvent {
    pub pauser: Pubkey,
    pub mint: Pubkey,
}

#[event]
pub struct UpdateMinterEvent {
    pub operation: String,
    pub mint: Pubkey,
    pub minter: Pubkey,
    pub allowance: u64,
}

#[event]
pub struct UpdateRolesEvent {
    pub role: String,
    pub mint: Pubkey,
    pub master: Pubkey,
}
