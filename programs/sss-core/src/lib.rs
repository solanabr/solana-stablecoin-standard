use anchor_lang::prelude::*;

pub mod constants;
pub mod error;
pub mod events;
pub mod instructions;
pub mod state;

use instructions::*;

declare_id!("G3jadBDzaF2HbTY2at5auYYQQ94zhhWaocMuWDgUy2vL");

#[cfg(not(feature = "no-entrypoint"))]
use {solana_security_txt::security_txt};

#[cfg(not(feature = "no-entrypoint"))]
security_txt! {
    name: "Solana Stablecoin Standard (SSS)",
    project_url: "https://github.com/solana-stablecoin-standard",
    contacts: "email:security@sss.dev",
    policy: "https://github.com/solana-stablecoin-standard/blob/main/SECURITY.md",
    preferred_languages: "en",
    auditors: "N/A"
}

#[program]
pub mod sss_core {
    use super::*;

    /// Initialize a new stablecoin with Token-2022 extensions
    pub fn initialize(
        ctx: Context<Initialize>,
        input: state::StablecoinConfigInput,
    ) -> Result<()> {
        instructions::initialize::handler(ctx, input)
    }

    /// Mint tokens (requires minter role + quota check)
    pub fn mint_tokens(ctx: Context<MintTokens>, amount: u64) -> Result<()> {
        instructions::mint::handler(ctx, amount)
    }

    /// Burn tokens from caller's account
    pub fn burn_tokens(ctx: Context<BurnTokens>, amount: u64) -> Result<()> {
        instructions::burn::handler(ctx, amount)
    }

    /// Freeze a token account (requires freezer role)
    pub fn freeze_account(ctx: Context<FreezeTokenAccount>) -> Result<()> {
        instructions::freeze::freeze_handler(ctx)
    }

    /// Thaw a frozen token account (requires freezer role)
    pub fn thaw_account(ctx: Context<ThawTokenAccount>) -> Result<()> {
        instructions::freeze::thaw_handler(ctx)
    }

    /// Pause the stablecoin (authority only)
    pub fn pause(ctx: Context<AdminAction>) -> Result<()> {
        instructions::admin::pause_handler(ctx)
    }

    /// Unpause the stablecoin (authority only)
    pub fn unpause(ctx: Context<AdminAction>) -> Result<()> {
        instructions::admin::unpause_handler(ctx)
    }

    /// Step 1: Propose a new authority (two-step transfer for safety)
    pub fn propose_authority(
        ctx: Context<AdminAction>,
        new_authority: Pubkey,
    ) -> Result<()> {
        instructions::admin::propose_authority_handler(ctx, new_authority)
    }

    /// Step 2: Accept authority transfer (new authority must sign)
    pub fn accept_authority(ctx: Context<AcceptAuthority>) -> Result<()> {
        instructions::admin::accept_authority_handler(ctx)
    }

    /// Cancel a pending authority transfer
    pub fn cancel_authority_transfer(ctx: Context<AdminAction>) -> Result<()> {
        instructions::admin::cancel_authority_transfer_handler(ctx)
    }

    /// Single-step authority transfer (immediate, no acceptance needed)
    pub fn transfer_authority(
        ctx: Context<TransferAuthority>,
        new_authority: Pubkey,
    ) -> Result<()> {
        instructions::admin::transfer_authority_handler(ctx, new_authority)
    }

    /// Grant a role to an address
    pub fn grant_role(
        ctx: Context<GrantRole>,
        role: u8,
        holder: Pubkey,
    ) -> Result<()> {
        instructions::roles::grant_role_handler(ctx, role, holder)
    }

    /// Revoke a role from an address
    pub fn revoke_role(
        ctx: Context<RevokeRole>,
        role: u8,
        holder: Pubkey,
    ) -> Result<()> {
        instructions::roles::revoke_role_handler(ctx, role, holder)
    }

    /// Set minting quota for a minter
    pub fn set_quota(
        ctx: Context<SetQuota>,
        minter: Pubkey,
        quota_limit: u64,
    ) -> Result<()> {
        instructions::roles::set_quota_handler(ctx, minter, quota_limit)
    }

    // --- SSS-2 Compliance Instructions ---

    /// Add an address to the blacklist (SSS-2 only)
    pub fn add_to_blacklist(
        ctx: Context<AddToBlacklist>,
        address: Pubkey,
        reason: String,
    ) -> Result<()> {
        instructions::blacklist::add_to_blacklist_handler(ctx, address, reason)
    }

    /// Remove an address from the blacklist (SSS-2 only)
    pub fn remove_from_blacklist(
        ctx: Context<RemoveFromBlacklist>,
        address: Pubkey,
    ) -> Result<()> {
        instructions::blacklist::remove_from_blacklist_handler(ctx, address)
    }

    /// Atomic seize: thaw -> burn -> refreeze -> mint to treasury (SSS-2 only)
    pub fn seize(ctx: Context<SeizeTokens>, amount: u64) -> Result<()> {
        instructions::seize::seize_handler(ctx, amount)
    }

    /// Update token metadata field (authority only)
    pub fn set_metadata(
        ctx: Context<SetMetadata>,
        input: instructions::metadata::UpdateMetadataInput,
    ) -> Result<()> {
        instructions::metadata::set_metadata_handler(ctx, input)
    }

    // --- SSS-3 Instructions ---

    /// Set the supply cap (0 = unlimited, authority only)
    pub fn set_supply_cap(ctx: Context<SetSupplyCap>, new_cap: u64) -> Result<()> {
        instructions::supply_cap::set_supply_cap_handler(ctx, new_cap)
    }

    /// Add an address to the allowlist (SSS-3, authority only)
    pub fn add_to_allowlist(
        ctx: Context<AddToAllowlist>,
        address: Pubkey,
    ) -> Result<()> {
        instructions::allowlist::add_to_allowlist_handler(ctx, address)
    }

    /// Remove an address from the allowlist (SSS-3, authority only)
    pub fn remove_from_allowlist(
        ctx: Context<RemoveFromAllowlist>,
        address: Pubkey,
    ) -> Result<()> {
        instructions::allowlist::remove_from_allowlist_handler(ctx, address)
    }

    /// Configure oracle price feed (authority only)
    pub fn configure_oracle(
        ctx: Context<ConfigureOracle>,
        input: instructions::oracle::ConfigureOracleInput,
    ) -> Result<()> {
        instructions::oracle::configure_oracle_handler(ctx, input)
    }
}
