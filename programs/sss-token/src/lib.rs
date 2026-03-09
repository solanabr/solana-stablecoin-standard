#![allow(unexpected_cfgs, ambiguous_glob_reexports, deprecated)]

use anchor_lang::prelude::*;

pub mod errors;
pub mod events;
pub mod instructions;
pub mod state;
pub mod utils;

use instructions::*;

declare_id!("5ZBiFxX4ggWfNR5VhAQDRZauG6CvG84puS4SQiH8BcL4");

#[program]
pub mod sss_token {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>, params: InitializeParams) -> Result<()> {
        instructions::initialize::handler(ctx, params)
    }

    pub fn mint_tokens(ctx: Context<MintTokens>, amount: u64) -> Result<()> {
        instructions::mint::handler(ctx, amount)
    }

    pub fn burn_tokens(ctx: Context<BurnTokens>, amount: u64) -> Result<()> {
        instructions::burn::handler(ctx, amount)
    }

    pub fn freeze_account(ctx: Context<FreezeTokenAccount>) -> Result<()> {
        instructions::freeze::handler(ctx)
    }

    pub fn thaw_account(ctx: Context<ThawTokenAccount>) -> Result<()> {
        instructions::thaw::handler(ctx)
    }

    pub fn pause(ctx: Context<Pause>) -> Result<()> {
        instructions::pause::handler(ctx)
    }

    pub fn unpause(ctx: Context<Unpause>) -> Result<()> {
        instructions::unpause::handler(ctx)
    }

    pub fn update_roles(ctx: Context<UpdateRoles>, params: UpdateRoleParams) -> Result<()> {
        instructions::update_roles::handler(ctx, params)
    }

    pub fn update_minter(ctx: Context<UpdateMinter>, params: UpdateMinterParams) -> Result<()> {
        instructions::update_minter::handler(ctx, params)
    }

    pub fn transfer_authority(ctx: Context<TransferAuthority>) -> Result<()> {
        instructions::transfer_authority::handler(ctx)
    }

    pub fn blacklist_add(ctx: Context<BlacklistAdd>, params: BlacklistAddParams) -> Result<()> {
        instructions::blacklist_add::handler(ctx, params)
    }

    pub fn blacklist_remove(ctx: Context<BlacklistRemove>) -> Result<()> {
        instructions::blacklist_remove::handler(ctx)
    }

    pub fn seize(ctx: Context<Seize>, amount: u64) -> Result<()> {
        instructions::seize::handler(ctx, amount)
    }

    pub fn attest_reserve(ctx: Context<AttestReserve>, params: AttestReserveParams) -> Result<()> {
        instructions::attest_reserve::handler(ctx, params)
    }
}
