use anchor_lang::prelude::*;

pub mod errors;
pub mod instructions;
pub mod state;

use instructions::*;

declare_id!("AcmGr2zw5RqMjuT1BN68Gk8gBhaFeF4piUXTyRQrVw3t");

/// # Solana Stablecoin Standard (SSS) — Main Token Program
///
/// A modular stablecoin program supporting configurable presets:
///
/// - **SSS-1 (Minimal)**: Mint + freeze + metadata. For DAO treasuries,
///   simple stablecoins, ecosystem settlement.
/// - **SSS-2 (Compliant)**: SSS-1 + permanent delegate + transfer hook +
///   blacklist. For USDC/USDT-class regulated tokens.
/// - **SSS-3 (Private)**: SSS-1 + confidential transfers. Experimental.
///
/// ## Architecture
/// - Config PDA is the **mint authority** and **freeze authority**
/// - Role-based access control via RoleManager PDA
/// - Per-minter quotas prevent unlimited minting
/// - Global pause mechanism for emergency circuit-breaking
/// - Anchor events on every state change for off-chain indexing
#[program]
pub mod sss_token {
    use super::*;

    /// Initialize a new stablecoin with Token-2022 extensions.
    pub fn initialize(ctx: Context<Initialize>, params: InitializeParams) -> Result<()> {
        instructions::initialize::handler(ctx, params)
    }

    /// Mint tokens to a recipient. Requires minter role with available quota.
    pub fn mint_tokens(ctx: Context<MintTokens>, amount: u64) -> Result<()> {
        instructions::mint::handler(ctx, amount)
    }

    /// Burn tokens. Requires burner role.
    pub fn burn_tokens(ctx: Context<BurnTokens>, amount: u64) -> Result<()> {
        instructions::burn::handler(ctx, amount)
    }

    /// Freeze a token account. Master authority or pauser can freeze.
    pub fn freeze_account(ctx: Context<FreezeAccount>) -> Result<()> {
        instructions::freeze::handler(ctx)
    }

    /// Thaw a frozen token account. Only master authority.
    pub fn thaw_account(ctx: Context<ThawAccount>) -> Result<()> {
        instructions::thaw::handler(ctx)
    }

    /// Pause all mint/burn operations globally.
    pub fn pause(ctx: Context<Pause>) -> Result<()> {
        instructions::pause::pause_handler(ctx)
    }

    /// Unpause operations. Only master authority.
    pub fn unpause(ctx: Context<Unpause>) -> Result<()> {
        instructions::pause::unpause_handler(ctx)
    }

    /// Add or update a minter with a quota.
    pub fn update_minter(ctx: Context<UpdateMinter>, minter: Pubkey, quota: u64) -> Result<()> {
        instructions::roles::update_minter_handler(ctx, minter, quota)
    }

    /// Remove a minter.
    pub fn remove_minter(ctx: Context<RemoveMinter>, minter: Pubkey) -> Result<()> {
        instructions::roles::remove_minter_handler(ctx, minter)
    }

    /// Update role assignments.
    pub fn update_roles(ctx: Context<UpdateRoles>, params: UpdateRolesParams) -> Result<()> {
        instructions::roles::update_roles_handler(ctx, params)
    }

    /// Transfer master authority to a new address.
    pub fn transfer_authority(
        ctx: Context<TransferAuthority>,
        new_authority: Pubkey,
    ) -> Result<()> {
        instructions::roles::transfer_authority_handler(ctx, new_authority)
    }

    // ── SSS-2 Compliance ───────────────────────────────────────────

    /// Add an address to the blacklist. SSS-2 only.
    pub fn add_to_blacklist(ctx: Context<AddToBlacklist>, reason: String) -> Result<()> {
        instructions::blacklist::add_handler(ctx, reason)
    }

    /// Remove an address from the blacklist. SSS-2 only.
    pub fn remove_from_blacklist(ctx: Context<RemoveFromBlacklist>) -> Result<()> {
        instructions::blacklist::remove_handler(ctx)
    }

    /// Seize tokens from frozen blacklisted account. SSS-2 only.
    pub fn seize(ctx: Context<Seize>) -> Result<()> {
        instructions::seize::handler(ctx)
    }
}
