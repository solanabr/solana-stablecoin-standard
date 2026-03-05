#![allow(ambiguous_glob_reexports)]

use anchor_lang::prelude::*;

pub mod errors;
pub mod events;
pub mod instructions;
pub mod state;

pub use errors::*;
pub use events::*;
pub use instructions::*;
pub use state::*;

declare_id!("AmBgA4sV1xFrT4BwbqUU3P3cFqLa6yNJmHyX98k4eW1j");

#[program]
pub mod sss_stablecoin {
    use super::*;

    pub fn initialize(
        ctx: Context<Initialize>,
        name: String,
        symbol: String,
        decimals: u8,
        enable_permanent_delegate: bool,
        enable_transfer_hook: bool,
        default_account_frozen: bool,
        enable_privacy: bool,
    ) -> Result<()> {
        instructions::initialize(
            ctx,
            name,
            symbol,
            decimals,
            enable_permanent_delegate,
            enable_transfer_hook,
            default_account_frozen,
            enable_privacy,
        )
    }

    pub fn mint(ctx: Context<Mint>, amount: u64) -> Result<()> {
        instructions::mint(ctx, amount)
    }

    pub fn burn(ctx: Context<Burn>, amount: u64) -> Result<()> {
        instructions::burn_tokens(ctx, amount)
    }

    pub fn freeze_account(ctx: Context<FreezeAccount>) -> Result<()> {
        instructions::freeze_account_handler(ctx)
    }

    pub fn thaw_account(ctx: Context<ThawAccount>) -> Result<()> {
        instructions::thaw_account_handler(ctx)
    }

    pub fn pause(ctx: Context<Pause>) -> Result<()> {
        instructions::pause(ctx)
    }

    pub fn unpause(ctx: Context<Unpause>) -> Result<()> {
        instructions::unpause(ctx)
    }

    pub fn update_minter(
        ctx: Context<UpdateMinter>,
        address: Pubkey,
        action: UpdateMinterAction,
    ) -> Result<()> {
        instructions::update_minter(ctx, address, action)
    }

    pub fn update_roles(
        ctx: Context<UpdateRoles>,
        role_type: RoleType,
        address: Pubkey,
        action: UpdateRoleAction,
    ) -> Result<()> {
        instructions::update_roles(ctx, role_type, address, action)
    }

    pub fn propose_authority(ctx: Context<ProposeAuthority>, new_authority: Pubkey) -> Result<()> {
        instructions::propose_authority(ctx, new_authority)
    }

    pub fn accept_authority(ctx: Context<AcceptAuthority>) -> Result<()> {
        instructions::accept_authority(ctx)
    }

    pub fn add_to_blacklist(
        ctx: Context<AddToBlacklist>,
        address: Pubkey,
        reason: String,
    ) -> Result<()> {
        instructions::add_to_blacklist(ctx, address, reason)
    }

    pub fn remove_from_blacklist(ctx: Context<RemoveFromBlacklist>, address: Pubkey) -> Result<()> {
        instructions::remove_from_blacklist(ctx, address)
    }

    pub fn seize(ctx: Context<Seize>) -> Result<()> {
        instructions::seize(ctx)
    }
}
