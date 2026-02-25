use anchor_lang::prelude::*;

pub mod constants;
pub mod error;
pub mod events;
pub mod instructions;
pub mod state;

use instructions::*;

declare_id!("E7iCiXrkudyt5j1nVHHmbuqCEyLP2hD4VGNJyuPAdWwP");

#[program]
pub mod sss_token {
    use super::*;

    // ── Initialize ────────────────────────────────────────────────────────────

    /// Create a new stablecoin (Token-2022 mint + config + role accounts).
    /// preset: "sss-1" (minimal) or "sss-2" (compliant with permanent delegate + transfer hook)
    pub fn initialize<'info>(
        ctx: Context<'_, '_, '_, 'info, Initialize<'info>>,
        params: InitializeParams,
    ) -> Result<()> {
        instructions::initialize::handler(ctx, params)
    }

    // ── Mint / Burn ───────────────────────────────────────────────────────────

    /// Mint tokens to a recipient. Caller must hold the Minter role.
    /// Enforces per-minter quota (0 = unlimited) and global pause.
    pub fn mint_tokens(ctx: Context<MintTokens>, amount: u64) -> Result<()> {
        instructions::mint_tokens::handler(ctx, amount)
    }

    /// Burn tokens from the caller's own token account.
    /// Caller must hold the Burner role.
    pub fn burn_tokens(ctx: Context<BurnTokens>, amount: u64) -> Result<()> {
        instructions::burn::handler(ctx, amount)
    }

    // ── Freeze / Thaw ─────────────────────────────────────────────────────────

    /// Freeze a specific token account (blocks all transfers from/to it).
    /// Caller must be master authority or hold the Pauser role.
    pub fn freeze_account(ctx: Context<FreezeTokenAccount>) -> Result<()> {
        instructions::freeze::freeze_handler(ctx)
    }

    /// Unfreeze a previously frozen token account.
    pub fn thaw_account(ctx: Context<ThawTokenAccount>) -> Result<()> {
        instructions::freeze::thaw_handler(ctx)
    }

    // ── Pause / Unpause ───────────────────────────────────────────────────────

    /// Globally pause all mint, burn, and transfer operations.
    /// Caller must be master authority or hold the Pauser role.
    pub fn pause(ctx: Context<PauseUnpause>) -> Result<()> {
        instructions::pause::pause_handler(ctx)
    }

    /// Resume normal operations after a global pause.
    pub fn unpause(ctx: Context<PauseUnpause>) -> Result<()> {
        instructions::pause::unpause_handler(ctx)
    }

    // ── Role Management ───────────────────────────────────────────────────────

    /// Add a new minter with associated MinterInfo PDA (quota tracking).
    /// Only master authority can call this.
    pub fn add_minter(
        ctx: Context<AddMinter>,
        minter: Pubkey,
        quota: u64,
    ) -> Result<()> {
        instructions::roles::add_minter_handler(ctx, minter, quota)
    }

    /// Add an address to a role (Burner, Pauser, Blacklister, Seizer).
    /// For Minter role, use add_minter instead (creates MinterInfo PDA).
    pub fn add_role(
        ctx: Context<UpdateRoles>,
        role: RoleType,
        address: Pubkey,
    ) -> Result<()> {
        instructions::roles::add_role_handler(ctx, role, address)
    }

    /// Remove an address from a role.
    pub fn remove_role(
        ctx: Context<UpdateRoles>,
        role: RoleType,
        address: Pubkey,
    ) -> Result<()> {
        instructions::roles::remove_role_handler(ctx, role, address)
    }

    /// Update the minting quota for an existing minter.
    /// Set quota to 0 for unlimited minting.
    pub fn update_minter_quota(
        ctx: Context<UpdateMinterQuota>,
        minter: Pubkey,
        new_quota: u64,
    ) -> Result<()> {
        instructions::roles::update_minter_quota_handler(ctx, minter, new_quota)
    }

    // ── SSS-2: Compliance (requires enable_permanent_delegate = true) ─────────

    /// Add an address to the compliance blacklist (SSS-2 only).
    /// Creates a BlacklistEntry PDA — transfer hook rejects transfers involving this address.
    pub fn add_to_blacklist(
        ctx: Context<AddToBlacklist>,
        address: Pubkey,
        reason: String,
    ) -> Result<()> {
        instructions::blacklist::add_to_blacklist_handler(ctx, address, reason)
    }

    /// Remove an address from the compliance blacklist (SSS-2 only).
    /// Closes the BlacklistEntry PDA — address can transact again.
    pub fn remove_from_blacklist(
        ctx: Context<RemoveFromBlacklist>,
        address: Pubkey,
    ) -> Result<()> {
        instructions::blacklist::remove_from_blacklist_handler(ctx, address)
    }

    /// Seize tokens from a frozen account to a treasury (SSS-2 only).
    /// Uses the PermanentDelegate extension — no token owner signature required.
    /// Pass hook program + ExtraAccountMetaList as remaining_accounts.
    pub fn seize<'info>(
        ctx: Context<'_, '_, '_, 'info, SeizeTokens<'info>>,
        amount: u64,
    ) -> Result<()> {
        instructions::seize::handler(ctx, amount)
    }

    // ── Authority Transfer ────────────────────────────────────────────────────

    /// Transfer master authority to a new keypair.
    /// This is irreversible without the new authority's cooperation.
    pub fn transfer_authority(
        ctx: Context<TransferAuthority>,
        new_authority: Pubkey,
    ) -> Result<()> {
        instructions::authority::handler(ctx, new_authority)
    }
}
