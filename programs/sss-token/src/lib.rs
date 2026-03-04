// SSS-Token — Solana Stablecoin Standard
//
// Implements two compliance tiers on Token-2022:
//   SSS-1  Minimal stablecoin: mint + freeze authority + metadata
//   SSS-2  Compliant stablecoin: SSS-1 + permanent delegate + transfer hook
//          + blacklist enforcement (GENIUS Act compatible)
//
// All Token-2022 operations use `anchor_spl::token_interface` so the program
// is forward-compatible with both Token and Token-2022 mints (though in
// practice this suite always creates Token-2022 mints).

use anchor_lang::prelude::*;

pub mod error;
pub mod events;
pub mod instructions;
pub mod state;

use instructions::{
    authority::{
        accept_authority_handler, nominate_authority_handler, AcceptAuthorityCtx,
        NominateAuthorityCtx,
    },
    burn::{handler as burn_handler, BurnCtx},
    compliance::{
        add_to_blacklist_handler, remove_from_blacklist_handler, seize_handler,
        AddToBlacklistCtx, RemoveFromBlacklistCtx, SeizeCtx,
    },
    freeze::{freeze_handler, thaw_handler, FreezeAccountCtx, ThawAccountCtx},
    initialize::{handler as initialize_handler, Initialize, InitializeParams},
    mint::{handler as mint_to_handler, MintToCtx},
    pause::{pause_handler, unpause_handler, PauseCtx, UnpauseCtx},
    roles::{
        add_minter_handler, add_role_handler, remove_minter_handler, remove_role_handler,
        update_minter_handler, AddMinterCtx, AddRoleCtx, RemoveMinterCtx, RemoveRoleCtx,
        UpdateMinterCtx,
    },
};
use state::RoleType;

// Re-export the __client_accounts_xxx modules so the #[program] macro's generated
// `accounts` module can find them at the crate root (it generates `pub use crate::__client_accounts_xxx::*`).
pub(crate) use instructions::authority::__client_accounts_accept_authority_ctx;
pub(crate) use instructions::authority::__client_accounts_nominate_authority_ctx;
pub(crate) use instructions::burn::__client_accounts_burn_ctx;
pub(crate) use instructions::compliance::__client_accounts_add_to_blacklist_ctx;
pub(crate) use instructions::compliance::__client_accounts_remove_from_blacklist_ctx;
pub(crate) use instructions::compliance::__client_accounts_seize_ctx;
pub(crate) use instructions::freeze::__client_accounts_freeze_account_ctx;
pub(crate) use instructions::freeze::__client_accounts_thaw_account_ctx;
pub(crate) use instructions::initialize::__client_accounts_initialize;
pub(crate) use instructions::mint::__client_accounts_mint_to_ctx;
pub(crate) use instructions::pause::__client_accounts_pause_ctx;
pub(crate) use instructions::pause::__client_accounts_unpause_ctx;
pub(crate) use instructions::roles::__client_accounts_add_minter_ctx;
pub(crate) use instructions::roles::__client_accounts_add_role_ctx;
pub(crate) use instructions::roles::__client_accounts_remove_minter_ctx;
pub(crate) use instructions::roles::__client_accounts_remove_role_ctx;
pub(crate) use instructions::roles::__client_accounts_update_minter_ctx;

declare_id!("GgcHf4khPVY28yVkQGDgBjaNLgsjNWGaNdfmL36wgPGp");

#[program]
pub mod sss_token {
    use super::*;

    // ─────────────────────────────────────────────────────────────────────
    // Lifecycle
    // ─────────────────────────────────────────────────────────────────────

    /// Create a new stablecoin mint with Token-2022 extensions.
    ///
    /// Depending on `params`, this initialises an SSS-1 (minimal) or SSS-2
    /// (compliant) mint.  The extensions — MetadataPointer, PermanentDelegate,
    /// TransferHook, DefaultAccountState — are initialised in the mandatory
    /// Token-2022 order (before InitializeMint).
    pub fn initialize(ctx: Context<Initialize>, params: InitializeParams) -> Result<()> {
        initialize_handler(ctx, params)
    }

    // ─────────────────────────────────────────────────────────────────────
    // Core token operations
    // ─────────────────────────────────────────────────────────────────────

    /// Mint tokens to a destination account.
    ///
    /// The caller must be the master authority OR hold an active MinterRole
    /// PDA for this mint.  Quota-bounded minters cannot exceed their
    /// configured limit.
    pub fn mint_to(ctx: Context<MintToCtx>, amount: u64) -> Result<()> {
        mint_to_handler(ctx, amount)
    }

    /// Burn tokens from a token account.
    ///
    /// The caller must be the master authority OR hold an active BurnerRole.
    /// When the permanent delegate is enabled the program uses it to burn
    /// tokens it does not own; otherwise the caller must own the account.
    pub fn burn(ctx: Context<BurnCtx>, amount: u64) -> Result<()> {
        burn_handler(ctx, amount)
    }

    // ─────────────────────────────────────────────────────────────────────
    // Freeze / thaw
    // ─────────────────────────────────────────────────────────────────────

    /// Freeze a token account so it cannot send or receive transfers.
    ///
    /// Requires Freezer role or master authority.  The config PDA signs the
    /// CPI as the freeze authority.
    pub fn freeze_account(ctx: Context<FreezeAccountCtx>) -> Result<()> {
        freeze_handler(ctx)
    }

    /// Unfreeze (thaw) a previously frozen token account.
    pub fn thaw_account(ctx: Context<ThawAccountCtx>) -> Result<()> {
        thaw_handler(ctx)
    }

    // ─────────────────────────────────────────────────────────────────────
    // Emergency pause
    // ─────────────────────────────────────────────────────────────────────

    /// Pause the program — blocks `mint_to` and `burn` globally.
    ///
    /// Requires Pauser role or master authority.
    pub fn pause(ctx: Context<PauseCtx>) -> Result<()> {
        pause_handler(ctx)
    }

    /// Resume normal operation after a pause.
    pub fn unpause(ctx: Context<UnpauseCtx>) -> Result<()> {
        unpause_handler(ctx)
    }

    // ─────────────────────────────────────────────────────────────────────
    // Minter management
    // ─────────────────────────────────────────────────────────────────────

    /// Register a new minter with an optional quota (0 = unlimited).
    ///
    /// Master authority only.
    pub fn add_minter(ctx: Context<AddMinterCtx>, quota: u64) -> Result<()> {
        add_minter_handler(ctx, quota)
    }

    /// Deactivate an existing minter.  The PDA is preserved for audit trail.
    ///
    /// Master authority only.
    pub fn remove_minter(ctx: Context<RemoveMinterCtx>) -> Result<()> {
        remove_minter_handler(ctx)
    }

    /// Update an existing minter's quota in place without deactivating it.
    ///
    /// Master authority only.
    pub fn update_minter(ctx: Context<UpdateMinterCtx>, new_quota: u64) -> Result<()> {
        update_minter_handler(ctx, new_quota)
    }

    // ─────────────────────────────────────────────────────────────────────
    // Role management
    // ─────────────────────────────────────────────────────────────────────

    /// Assign a compliance role (Blacklister / Pauser / Seizer / Burner /
    /// Freezer) to an address.
    ///
    /// Master authority only.
    pub fn add_role(ctx: Context<AddRoleCtx>, role: RoleType, address: Pubkey) -> Result<()> {
        add_role_handler(ctx, role, address)
    }

    /// Revoke a compliance role from an address.  The PDA is preserved.
    ///
    /// Master authority only.
    pub fn remove_role(
        ctx: Context<RemoveRoleCtx>,
        role: RoleType,
        address: Pubkey,
    ) -> Result<()> {
        remove_role_handler(ctx, role, address)
    }

    // ─────────────────────────────────────────────────────────────────────
    // Authority management (two-step transfer)
    // ─────────────────────────────────────────────────────────────────────

    /// Step 1: nominate a new master authority.
    ///
    /// Only one pending nomination may exist at a time.  The current
    /// authority must call this; the nominee must call `accept_authority`.
    pub fn nominate_authority(
        ctx: Context<NominateAuthorityCtx>,
        new_authority: Pubkey,
    ) -> Result<()> {
        nominate_authority_handler(ctx, new_authority)
    }

    /// Step 2: the nominated authority accepts and becomes the new master.
    ///
    /// The new authority must sign this transaction.
    pub fn accept_authority(ctx: Context<AcceptAuthorityCtx>) -> Result<()> {
        accept_authority_handler(ctx)
    }

    // ─────────────────────────────────────────────────────────────────────
    // SSS-2 compliance operations
    // ─────────────────────────────────────────────────────────────────────

    /// Add an address to the on-chain blacklist.
    ///
    /// Returns `Sss2NotEnabled` if neither permanent_delegate nor
    /// transfer_hook is configured on this mint.
    ///
    /// Requires Blacklister role or master authority.
    pub fn add_to_blacklist(ctx: Context<AddToBlacklistCtx>, reason: String) -> Result<()> {
        add_to_blacklist_handler(ctx, reason)
    }

    /// Remove an address from the on-chain blacklist.
    ///
    /// Returns `Sss2NotEnabled` if SSS-2 is not configured.
    ///
    /// Requires Blacklister role or master authority.
    pub fn remove_from_blacklist(ctx: Context<RemoveFromBlacklistCtx>) -> Result<()> {
        remove_from_blacklist_handler(ctx)
    }

    /// Seize tokens from any account using the permanent delegate.
    ///
    /// Returns `Sss2NotEnabled` if SSS-2 is not configured.
    /// Returns `NoPermanentDelegate` if the permanent delegate extension is
    /// absent (e.g. transfer_hook-only SSS-2 configs).
    ///
    /// Requires Seizer role or master authority.
    pub fn seize<'info>(ctx: Context<'_, '_, '_, 'info, SeizeCtx<'info>>, amount: u64) -> Result<()> {
        seize_handler(ctx, amount)
    }
}
