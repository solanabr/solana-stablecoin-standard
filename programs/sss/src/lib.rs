use anchor_lang::prelude::*;

pub mod state;
pub mod instructions;
pub mod errors;
pub mod events;

use instructions::*;

declare_id!("HCzhfNz2Kc2wBfacsWzLsM5EdyUEeypFHRzbpDeMb9RM");

#[program]
pub mod sss {
    use super::*;

    pub fn initialize(
        ctx: Context<Initialize>,
        enable_permanent_delegate: bool,
        enable_transfer_hook: bool,
        default_account_frozen: bool,
    ) -> Result<()> {
        instructions::admin::initialize::initialize_handler(
            ctx,
            enable_permanent_delegate,
            enable_transfer_hook,
            default_account_frozen,
        )
    }

    pub fn update_roles(
        ctx: Context<UpdateRoles>,
        authority_to_update: Pubkey,
        has_minter: bool,
        has_burner: bool,
        has_pauser: bool,
        has_blacklister: bool,
        has_seizer: bool,
        has_compliance_admin: bool,
    ) -> Result<()> {
        instructions::admin::update_roles::update_roles_handler(
            ctx,
            authority_to_update,
            has_minter,
            has_burner,
            has_pauser,
            has_blacklister,
            has_seizer,
            has_compliance_admin,
        )
    }

    pub fn pause(ctx: Context<Pause>, is_paused: bool) -> Result<()> {
        instructions::admin::pause::pause_handler(ctx, is_paused)
    }

    pub fn update_quota(ctx: Context<UpdateQuota>, minter: Pubkey, limit: u64) -> Result<()> {
        instructions::admin::update_quota::update_quota_handler(ctx, minter, limit)
    }

    pub fn transfer_authority(ctx: Context<TransferAuthority>, new_master: Pubkey) -> Result<()> {
        instructions::admin::transfer_authority::transfer_authority_handler(ctx, new_master)
    }

    pub fn mint_token(ctx: Context<MintToken>, amount: u64) -> Result<()> {
        instructions::token::mint::mint_handler(ctx, amount)
    }

    pub fn burn_token(ctx: Context<BurnToken>, amount: u64) -> Result<()> {
        instructions::token::burn::burn_handler(ctx, amount)
    }

    pub fn freeze_account(ctx: Context<ToggleFreeze>) -> Result<()> {
        instructions::compliance::freeze::freeze(ctx)
    }

    pub fn thaw_account(ctx: Context<ToggleFreeze>) -> Result<()> {
        instructions::compliance::freeze::thaw(ctx)
    }

    pub fn add_to_blacklist(
        ctx: Context<ToggleBlacklist>,
        account_to_blacklist: Pubkey,
        reason: String,
    ) -> Result<()> {
        instructions::compliance::blacklist::add_to_blacklist(ctx, account_to_blacklist, reason)
    }

    pub fn remove_from_blacklist(
        ctx: Context<RemoveBlacklist>,
        account_to_remove: Pubkey,
    ) -> Result<()> {
        instructions::compliance::blacklist::remove_from_blacklist(ctx, account_to_remove)
    }

    pub fn seize(ctx: Context<Seize>, amount: u64) -> Result<()> {
        instructions::compliance::seize::seize_handler(ctx, amount)
    }
}
