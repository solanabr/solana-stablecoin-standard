use anchor_lang::prelude::*;

pub mod constants;
pub mod error;
pub mod events;
pub mod instructions;
pub mod state;

use instructions::*;
use state::*;

declare_id!("7qYYBZqC88Vt61pon3cJnbTpukCsgCETypo13cttMVMG");

#[program]
pub mod sss {
    use super::*;

    pub struct Sss;

    pub fn initialize(
        ctx: Context<Initialize>,
        standard: Standard,
        name: String,
        symbol: String,
        uri: String,
        decimals: u8,
        master: Pubkey,
        minter: Pubkey,
        initial_allowance: u64,
        enable_permanent_delegate: Option<bool>,
        enable_transfer_hook: Option<bool>,
        default_account_frozen: Option<bool>,
    ) -> Result<()> {
        instructions::initialize::handler(
            ctx,
            standard,
            name,
            symbol,
            uri,
            decimals,
            master,
            minter,
            initial_allowance,
            enable_permanent_delegate,
            enable_transfer_hook,
            default_account_frozen,
        )
    }

    pub fn mint_tokens(ctx: Context<Mint>, amount: u64) -> Result<()> {
        instructions::mint::handler(ctx, amount)
    }

    pub fn burn_tokens(ctx: Context<BurnTokens>, amount: u64) -> Result<()> {
        instructions::burn::handler(ctx, amount)
    }

    pub fn freeze_account(ctx: Context<FreezeTokenAccount>) -> Result<()> {
        instructions::freeze_account::handler(ctx)
    }

    pub fn thaw_account(ctx: Context<ThawTokenAccount>) -> Result<()> {
        instructions::thaw_account::handler(ctx)
    }

    pub fn pause(ctx: Context<Pause>) -> Result<()> {
        instructions::pause::handler(ctx)
    }

    pub fn unpause(ctx: Context<Unpause>) -> Result<()> {
        instructions::unpause::handler(ctx)
    }

    pub fn update_minter(
        ctx: Context<UpdateMinter>,
        operation: String,
        minter: Pubkey,
        allowance: u64,
    ) -> Result<()> {
        instructions::update_minter::handler(ctx, operation, minter, allowance)
    }

    pub fn update_roles<'c: 'info, 'info>(
        ctx: Context<'_, '_, 'c, 'info, UpdateRoles<'info>>,
        roles: Vec<UpdateRole>,
    ) -> Result<()> {
        instructions::update_roles::handler(ctx, roles)
    }

    pub fn transfer_authority(ctx: Context<TransferAuthority>, new_master: Pubkey) -> Result<()> {
        instructions::transfer_authority::handler(ctx, new_master)
    }

    pub fn add_to_blacklist(
        ctx: Context<AddToBlacklist>,
        wallet: Pubkey,
        reason: String,
    ) -> Result<()> {
        instructions::add_to_blacklist::handler(ctx, wallet, reason)
    }

    pub fn remove_from_blacklist(ctx: Context<RemoveFromBlacklist>, wallet: Pubkey) -> Result<()> {
        instructions::remove_from_blacklist::handler(ctx, wallet)
    }

    pub fn seize(ctx: Context<Seize>, amount: u64) -> Result<()> {
        instructions::seize::handler(ctx, amount)
    }
}
