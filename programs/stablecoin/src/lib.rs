#![allow(unexpected_cfgs)]

use anchor_lang::prelude::*;

pub mod errors;
pub mod events;
pub mod instructions;
pub mod state;

use instructions::*;

declare_id!("C7k7FTRLGLB5FJS7hWrpjqRiwmj5Px9DzMQUeouAxJ9r");

#[program]
pub mod stablecoin {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>, params: InitializeParams) -> Result<()> {
        instructions::initialize::initialize_handler(ctx, params)
    }

    pub fn mint(ctx: Context<MintTokens>, amount: u64) -> Result<()> {
        instructions::mint::mint_handler(ctx, amount)
    }

    pub fn burn(ctx: Context<BurnTokens>, amount: u64) -> Result<()> {
        instructions::burn::burn_handler(ctx, amount)
    }

    pub fn freeze_account(ctx: Context<FreezeTokenAccount>) -> Result<()> {
        instructions::freeze::freeze_handler(ctx)
    }

    pub fn thaw_account(ctx: Context<ThawTokenAccount>) -> Result<()> {
        instructions::freeze::thaw_handler(ctx)
    }

    pub fn pause(ctx: Context<PauseOps>) -> Result<()> {
        instructions::pause::pause_handler(ctx)
    }

    pub fn unpause(ctx: Context<UnpauseOps>) -> Result<()> {
        instructions::pause::unpause_handler(ctx)
    }

    pub fn update_minter(ctx: Context<UpdateMinter>, params: UpdateMinterParams) -> Result<()> {
        instructions::roles::update_minter_handler(ctx, params)
    }

    pub fn update_roles(ctx: Context<UpdateRoles>, params: UpdateRolesParams) -> Result<()> {
        instructions::roles::update_roles_handler(ctx, params)
    }

    pub fn transfer_authority(
        ctx: Context<TransferAuthority>,
        new_authority: Pubkey,
    ) -> Result<()> {
        instructions::roles::transfer_authority_handler(ctx, new_authority)
    }

    pub fn add_to_blacklist(ctx: Context<AddToBlacklist>, reason: String) -> Result<()> {
        instructions::compliance::add_to_blacklist_handler(ctx, reason)
    }

    pub fn remove_from_blacklist(ctx: Context<RemoveFromBlacklist>) -> Result<()> {
        instructions::compliance::remove_from_blacklist_handler(ctx)
    }

    pub fn seize(ctx: Context<SeizeTokens>, amount: u64) -> Result<()> {
        instructions::compliance::seize_handler(ctx, amount)
    }
}
