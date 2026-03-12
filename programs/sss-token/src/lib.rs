#![allow(unexpected_cfgs, ambiguous_glob_reexports, deprecated)]

use anchor_lang::prelude::*;
use solana_security_txt::security_txt;

pub mod errors;
pub mod events;
pub mod instructions;
pub mod state;
pub mod utils;

use instructions::*;

declare_id!("5ZBiFxX4ggWfNR5VhAQDRZauG6CvG84puS4SQiH8BcL4");

security_txt! {
    name: "SSS Token",
    project_url: "https://github.com/solanabr/solana-stablecoin-standard",
    contacts: "link:https://github.com/solanabr/solana-stablecoin-standard/issues",
    policy: "https://github.com/solanabr/solana-stablecoin-standard/blob/main/SECURITY.md",
    source_code: "https://github.com/solanabr/solana-stablecoin-standard",
    auditors: "N/A"
}

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

    pub fn nominate_authority(
        ctx: Context<NominateAuthority>,
        nominated_authority: Pubkey,
    ) -> Result<()> {
        instructions::nominate_authority::handler(ctx, nominated_authority)
    }

    pub fn accept_authority(ctx: Context<AcceptAuthority>) -> Result<()> {
        instructions::accept_authority::handler(ctx)
    }

    pub fn blacklist_add(ctx: Context<BlacklistAdd>, params: BlacklistAddParams) -> Result<()> {
        instructions::blacklist_add::handler(ctx, params)
    }

    pub fn blacklist_remove(ctx: Context<BlacklistRemove>) -> Result<()> {
        instructions::blacklist_remove::handler(ctx)
    }

    pub fn allowlist_add(ctx: Context<AllowlistAdd>, params: AllowlistAddParams) -> Result<()> {
        instructions::allowlist_add::handler(ctx, params)
    }

    pub fn allowlist_remove(ctx: Context<AllowlistRemove>) -> Result<()> {
        instructions::allowlist_remove::handler(ctx)
    }

    pub fn seize(ctx: Context<Seize>, amount: u64) -> Result<()> {
        instructions::seize::handler(ctx, amount)
    }

    pub fn set_supply_cap(ctx: Context<SetSupplyCap>, new_cap: u64) -> Result<()> {
        instructions::set_supply_cap::handler(ctx, new_cap)
    }

    pub fn update_metadata(
        ctx: Context<UpdateMetadata>,
        params: UpdateMetadataParams,
    ) -> Result<()> {
        instructions::update_metadata::handler(ctx, params)
    }

    pub fn attest_reserve(ctx: Context<AttestReserve>, params: AttestReserveParams) -> Result<()> {
        instructions::attest_reserve::handler(ctx, params)
    }
}
