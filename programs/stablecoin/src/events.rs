use anchor_lang::prelude::*;
use crate::state::{StablecoinPreset, Role};

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq, Debug)]
pub enum BlacklistAction {
    Added,
    Removed,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq, Debug)]
pub enum RoleAction {
    Assigned,
    Revoked,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq, Debug)]
pub enum FreezeAction {
    Frozen,
    Thawed,
}

#[event]
pub struct InitializeEvent {
    pub mint: Pubkey,
    pub preset: StablecoinPreset,
    pub owner: Pubkey,
    pub timestamp: i64,
}

#[event]
pub struct MintEvent {
    pub mint: Pubkey,
    pub minter: Pubkey,
    pub recipient: Pubkey,
    pub amount: u64,
    pub remaining_allowance: u64,
    pub timestamp: i64,
}

#[event]
pub struct BurnEvent {
    pub mint: Pubkey,
    pub burner: Pubkey,
    pub amount: u64,
    pub timestamp: i64,
}

#[event]
pub struct BlacklistEvent {
    pub mint: Pubkey,
    pub wallet: Pubkey,
    pub action: BlacklistAction,
    pub reason: String,
    pub by: Pubkey,
    pub timestamp: i64,
}

#[event]
pub struct SeizeEvent {
    pub mint: Pubkey,
    pub from: Pubkey,
    pub to: Pubkey,
    pub amount: u64,
    pub by: Pubkey,
    pub timestamp: i64,
}

#[event]
pub struct PauseEvent {
    pub mint: Pubkey,
    pub is_paused: bool,
    pub by: Pubkey,
    pub timestamp: i64,
}

#[event]
pub struct RoleEvent {
    pub mint: Pubkey,
    pub role: Role,
    pub assignee: Pubkey,
    pub action: RoleAction,
    pub by: Pubkey,
    pub timestamp: i64,
}

#[event]
pub struct FreezeEvent {
    pub mint: Pubkey,
    pub account: Pubkey,
    pub action: FreezeAction,
    pub by: Pubkey,
    pub timestamp: i64,
}

#[event]
pub struct OwnershipTransferEvent {
    pub mint: Pubkey,
    pub from: Pubkey,
    pub to: Pubkey,
    pub timestamp: i64,
}
