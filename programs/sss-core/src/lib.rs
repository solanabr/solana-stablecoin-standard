//! SSS-Core: Solana Stablecoin Standard — configurable Token-2022 stablecoin program.
//!
//! Supports two presets via initialization parameters:
//!   - SSS-1: Minimal stablecoin (mint + freeze + metadata)
//!   - SSS-2: Compliant stablecoin (SSS-1 + permanent delegate + transfer hook + blacklist)
//!
//! Architecture mirrors the Solana Vault Standard (SVS) patterns for consistency.

use anchor_lang::prelude::*;

pub mod constants;
pub mod error;
pub mod events;
pub mod instructions;
pub mod state;

use instructions::*;

declare_id!("SSSXsBqANHdRRPBEiNUjGjgARJmQR1tQHNBqJBMvFUw");

#[program]
pub mod sss_core {
    use super::*;

    // ============ Lifecycle ============

    /// Create a new stablecoin mint with the configured extensions.
    /// The `preset` field in config drives which Token-2022 extensions are enabled.
    pub fn initialize(ctx: Context<Initialize>, config: state::StablecoinConfig) -> Result<()> {
        instructions::initialize::handler(ctx, config)
    }

    // ============ Core Token Operations ============

    /// Mint tokens to recipient. Requires minter role and checks quota.
    pub fn mint_tokens(ctx: Context<MintTokens>, amount: u64) -> Result<()> {
        instructions::mint_tokens::handler(ctx, amount)
    }

    /// Burn tokens from a token account. Requires burner role.
    pub fn burn_tokens(ctx: Context<BurnTokens>, amount: u64) -> Result<()> {
        instructions::burn_tokens::handler(ctx, amount)
    }

    /// Freeze a token account (reactive compliance for SSS-1, enforcement for SSS-2).
    pub fn freeze_account(ctx: Context<FreezeAccount>) -> Result<()> {
        instructions::freeze_account::handler(ctx)
    }

    /// Thaw (unfreeze) a token account.
    pub fn thaw_account(ctx: Context<ThawAccount>) -> Result<()> {
        instructions::thaw_account::handler(ctx)
    }

    // ============ Admin / Emergency ============

    /// Pause all mint/burn operations (pauser role required).
    pub fn pause(ctx: Context<Pause>) -> Result<()> {
        instructions::admin::pause(ctx)
    }

    /// Resume operations after a pause.
    pub fn unpause(ctx: Context<Pause>) -> Result<()> {
        instructions::admin::unpause(ctx)
    }

    /// Transfer master authority to a new account.
    pub fn transfer_authority(
        ctx: Context<TransferAuthority>,
        new_authority: Pubkey,
    ) -> Result<()> {
        instructions::admin::transfer_authority(ctx, new_authority)
    }

    // ============ Role Management ============

    /// Grant or update a minter role with an optional cap.
    pub fn update_minter(
        ctx: Context<UpdateMinterRecord>,
        cap: Option<u64>,
        active: bool,
    ) -> Result<()> {
        instructions::roles::update_minter(ctx, cap, active)
    }

    /// Update a role assignment (burner, pauser, blacklister, seizer).
    pub fn update_role(
        ctx: Context<UpdateRole>,
        role: state::RoleKind,
        holder: Pubkey,
        active: bool,
    ) -> Result<()> {
        instructions::roles::update_role(ctx, role, holder, active)
    }

    // ============ SSS-2: Compliance ============

    /// Add an address to the on-chain blacklist. Requires blacklister role.
    /// Fails if compliance module was not enabled during initialization.
    pub fn add_to_blacklist(
        ctx: Context<AddToBlacklist>,
        reason: String,
    ) -> Result<()> {
        instructions::compliance::add_to_blacklist(ctx, reason)
    }

    /// Remove an address from the blacklist. Requires blacklister role.
    pub fn remove_from_blacklist(ctx: Context<RemoveFromBlacklist>) -> Result<()> {
        instructions::compliance::remove_from_blacklist(ctx)
    }

    /// Seize tokens from a frozen/blacklisted account via the permanent delegate.
    /// Sends seized tokens to the treasury. Requires seizer role.
    pub fn seize(ctx: Context<Seize>, amount: u64) -> Result<()> {
        instructions::compliance::seize(ctx, amount)
    }
}
