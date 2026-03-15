use anchor_lang::prelude::*;

pub mod errors;
pub mod instructions;
pub mod state;

use instructions::*;

declare_id!("GPXDvDTpDnCxWrkKXYkfFedKWhsvbmLj2FpXNQM3EV7y");

#[program]
pub mod solana_stablecoin {
    use super::*;

    // ─── Initialization ──────────────────────────────────────────────

    pub fn initialize(ctx: Context<Initialize>, params: InitializeParams) -> Result<()> {
        instructions::initialize::handler(ctx, params)
    }

    // ─── Token Operations (SSS-1 Base) ───────────────────────────────

    pub fn mint_tokens(ctx: Context<MintTokens>, amount: u64) -> Result<()> {
        instructions::mint::handler(ctx, amount)
    }

    pub fn burn_tokens(ctx: Context<BurnTokens>, amount: u64) -> Result<()> {
        instructions::burn::handler(ctx, amount)
    }

    pub fn freeze_account(ctx: Context<FreezeAccount>) -> Result<()> {
        instructions::freeze::handler(ctx)
    }

    pub fn thaw_account(ctx: Context<ThawAccount>) -> Result<()> {
        instructions::thaw::handler(ctx)
    }

    pub fn pause(ctx: Context<Pause>) -> Result<()> {
        instructions::pause::handler(ctx)
    }

    pub fn unpause(ctx: Context<Unpause>) -> Result<()> {
        instructions::unpause::handler(ctx)
    }

    // ─── Role Management ─────────────────────────────────────────────

    pub fn manage_role(ctx: Context<ManageRole>, params: ManageRoleParams) -> Result<()> {
        instructions::roles::handler(ctx, params)
    }

    pub fn transfer_authority(ctx: Context<TransferAuthority>, new_authority: Pubkey) -> Result<()> {
        instructions::roles::transfer_authority_handler(ctx, new_authority)
    }

    // ─── Compliance Operations (SSS-2) ───────────────────────────────

    pub fn add_to_blacklist(ctx: Context<AddToBlacklist>, address: Pubkey, reason: String) -> Result<()> {
        instructions::blacklist::add_handler(ctx, address, reason)
    }

    pub fn remove_from_blacklist(ctx: Context<RemoveFromBlacklist>, address: Pubkey) -> Result<()> {
        instructions::blacklist::remove_handler(ctx, address)
    }

    pub fn seize(ctx: Context<Seize>, amount: u64) -> Result<()> {
        instructions::seize::handler(ctx, amount)
    }
}
