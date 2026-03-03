use anchor_lang::prelude::*;

pub mod error;
pub mod events;
pub mod instructions;
pub mod state;
pub mod utils;

use instructions::*;
use state::Role;

declare_id!("FH3XosNdAdUPfcxVxjUrUoCrGaLw9L3i9eadu7M8nQZQ");

#[program]
pub mod sss_core {
    use super::*;

    pub fn create_mint(ctx: Context<CreateMint>, params: CreateMintParams) -> Result<()> {
        instructions::create_mint::handler(ctx, params)
    }

    pub fn mint_to(ctx: Context<MintTo>, amount: u64) -> Result<()> {
        instructions::mint_to::handler(ctx, amount)
    }

    pub fn burn_from(ctx: Context<BurnFrom>, amount: u64) -> Result<()> {
        instructions::burn_from::handler(ctx, amount)
    }

    pub fn seize(ctx: Context<Seize>, amount: u64) -> Result<()> {
        instructions::seize::handler(ctx, amount)
    }

    pub fn grant_role(ctx: Context<GrantRole>, role: Role, allowance: u64) -> Result<()> {
        instructions::grant_role::handler(ctx, role, allowance)
    }

    pub fn revoke_role(ctx: Context<RevokeRole>) -> Result<()> {
        instructions::revoke_role::handler(ctx)
    }

    pub fn increment_allowance(ctx: Context<IncrementAllowance>, amount: u64) -> Result<()> {
        instructions::increment_allowance::handler(ctx, amount)
    }

    pub fn blacklist(ctx: Context<Blacklist>, wallet: Pubkey) -> Result<()> {
        instructions::blacklist::handler(ctx, wallet)
    }

    pub fn unblacklist(ctx: Context<Unblacklist>, wallet: Pubkey) -> Result<()> {
        instructions::unblacklist::handler(ctx, wallet)
    }

    pub fn pause(ctx: Context<Pause>) -> Result<()> {
        instructions::pause::handler(ctx)
    }

    pub fn unpause(ctx: Context<Unpause>) -> Result<()> {
        instructions::unpause::handler(ctx)
    }

    pub fn transfer_admin(ctx: Context<TransferAdmin>, new_admin: Pubkey) -> Result<()> {
        instructions::transfer_admin::handler(ctx, new_admin)
    }

    pub fn accept_admin(ctx: Context<AcceptAdmin>) -> Result<()> {
        instructions::accept_admin::handler(ctx)
    }

    pub fn initialize_hook(ctx: Context<InitializeHook>) -> Result<()> {
        instructions::initialize_hook::handler(ctx)
    }

    pub fn freeze_account(ctx: Context<FreezeTokenAccount>) -> Result<()> {
        instructions::freeze_account::handler(ctx)
    }

    pub fn thaw_account(ctx: Context<ThawTokenAccount>) -> Result<()> {
        instructions::thaw_account::handler(ctx)
    }

    pub fn set_metadata(ctx: Context<SetMetadata>, params: SetMetadataParams) -> Result<()> {
        instructions::set_metadata::handler(ctx, params)
    }
}
