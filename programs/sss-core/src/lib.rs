//! # SSS Core — Solana Stablecoin Standard
//!
//! Core program implementing SSS-1 (Minimal) and SSS-2 (Compliant) stablecoin presets
//! using Token-2022 extensions. Provides role-based access control inspired by Circle's
//! FiatToken v2, minter quota management, pause/unpause, freeze/thaw, two-step authority
//! transfer, and token seizure via permanent delegate.
//!
//! ## Presets
//! - **SSS-1**: MetadataPointer, TokenMetadata, MintCloseAuthority
//! - **SSS-2**: All of SSS-1 + PermanentDelegate, TransferHook, DefaultAccountState(Frozen)
//! - **SSS-3**: All of SSS-2 + ConfidentialTransferMint (allowlist-based approval)

use anchor_lang::prelude::*;

pub mod constants;
pub mod error;
pub mod events;
pub mod instructions;
pub mod state;

use instructions::*;
use state::RoleType;

declare_id!("CZzvCtyZC8KR37DNDeGYpwN46YEc7WEh6RyeSRdhjY4Y");

#[program]
pub mod sss_core {
    use super::*;

    /// Initialize a new stablecoin with the specified preset and metadata.
    pub fn initialize(ctx: Context<Initialize>, params: InitializeParams) -> Result<()> {
        instructions::initialize::handle_initialize(ctx, params)
    }

    /// Configure a new minter or update an existing minter's quota.
    pub fn configure_minter(
        ctx: Context<ConfigureMinter>,
        minter_wallet: Pubkey,
        quota: u64,
    ) -> Result<()> {
        instructions::configure_minter::handle_configure_minter(ctx, minter_wallet, quota)
    }

    /// Disable a minter. Account is preserved for audit trail.
    pub fn remove_minter(ctx: Context<RemoveMinter>) -> Result<()> {
        instructions::remove_minter::handle_remove_minter(ctx)
    }

    /// Mint tokens to a destination account. Enforces minter quota.
    pub fn mint_tokens(ctx: Context<MintTokens>, amount: u64) -> Result<()> {
        instructions::mint::handle_mint(ctx, amount)
    }

    /// Burn tokens from the signer's token account.
    pub fn burn_tokens(ctx: Context<BurnTokens>, amount: u64) -> Result<()> {
        instructions::burn::handle_burn(ctx, amount)
    }

    /// Freeze a token account. Available to authority and blacklister.
    /// Works even when paused (emergency power).
    pub fn freeze_account(ctx: Context<FreezeTokenAccount>) -> Result<()> {
        instructions::freeze::handle_freeze(ctx)
    }

    /// Thaw a frozen token account. Available to authority and blacklister.
    /// Works even when paused (emergency power).
    pub fn thaw_account(ctx: Context<ThawTokenAccount>) -> Result<()> {
        instructions::thaw::handle_thaw(ctx)
    }

    /// Pause all minting, burning, and transfer operations.
    pub fn pause(ctx: Context<Pause>) -> Result<()> {
        instructions::pause::handle_pause(ctx)
    }

    /// Resume operations after a pause.
    pub fn unpause(ctx: Context<Unpause>) -> Result<()> {
        instructions::unpause::handle_unpause(ctx)
    }

    /// Update a role assignment. Only the authority can call this.
    pub fn update_role(
        ctx: Context<UpdateRole>,
        role: RoleType,
        new_address: Pubkey,
    ) -> Result<()> {
        instructions::update_roles::handle_update_role(ctx, role, new_address)
    }

    /// Initiate a two-step authority transfer.
    pub fn transfer_authority(
        ctx: Context<TransferAuthority>,
        new_authority: Pubkey,
    ) -> Result<()> {
        instructions::transfer_authority::handle_transfer_authority(ctx, new_authority)
    }

    /// Accept a pending authority transfer. Must be called by the pending authority.
    pub fn accept_authority(ctx: Context<AcceptAuthority>) -> Result<()> {
        instructions::accept_authority::handle_accept_authority(ctx)
    }

    /// Seize tokens from a target account using the permanent delegate (SSS-2 only).
    pub fn seize<'a>(ctx: Context<'_, '_, 'a, 'a, Seize<'a>>, amount: u64) -> Result<()> {
        instructions::seize::handle_seize(ctx, amount)
    }

    /// Approve a wallet's token account for confidential transfers (SSS-3 only).
    /// Creates an AllowlistEntry PDA and CPIs to Token-2022 to approve the account.
    pub fn approve_confidential(
        ctx: Context<ApproveConfidential>,
        wallet: Pubkey,
    ) -> Result<()> {
        instructions::approve_confidential::handle_approve_confidential(ctx, wallet)
    }

    /// Revoke a wallet's confidential transfer approval (SSS-3 only).
    /// Marks the AllowlistEntry as revoked.
    pub fn revoke_confidential(ctx: Context<RevokeConfidential>) -> Result<()> {
        instructions::revoke_confidential::handle_revoke_confidential(ctx)
    }
}
