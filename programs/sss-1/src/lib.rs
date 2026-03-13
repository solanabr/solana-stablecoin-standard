use anchor_lang::prelude::*;

pub mod constants;
pub mod error;
pub mod events;
pub mod instructions;
pub mod state;

use instructions::*;

declare_id!("J4Z8HDQs2VbmSxs1VURkGY5M51SDmiY8K5a1RVuTN6np");

#[program]
pub mod sss_1 {
    use super::*;

    /// Initialize a new stablecoin with Token-2022 mint (MetadataPointer + TokenMetadata)
    pub fn initialize(
        ctx: Context<Initialize>,
        name: String,
        symbol: String,
        uri: String,
        decimals: u8,
        roles_enabled: bool,
        freeze_enabled: bool,
    ) -> Result<()> {
        instructions::initialize::handler(
            ctx,
            name,
            symbol,
            uri,
            decimals,
            roles_enabled,
            freeze_enabled,
        )
    }

    /// Grant a role to an authority (Admin only)
    pub fn grant_role(ctx: Context<GrantRole>, role_type: u8) -> Result<()> {
        instructions::grant_role::handler(ctx, role_type)
    }

    /// Revoke a role from an authority (Admin only)
    pub fn revoke_role(ctx: Context<RevokeRole>) -> Result<()> {
        instructions::revoke_role::handler(ctx)
    }

    /// Mint tokens to a destination account (Minter role required)
    pub fn mint_tokens(ctx: Context<MintTokens>, amount: u64) -> Result<()> {
        instructions::mint_tokens::handler(ctx, amount)
    }

    /// Burn tokens from a source account (Burner role required)
    pub fn burn_tokens(ctx: Context<BurnTokens>, amount: u64) -> Result<()> {
        instructions::burn_tokens::handler(ctx, amount)
    }

    /// Freeze a token account (Freezer role required)
    pub fn freeze_account(ctx: Context<FreezeTokenAccount>) -> Result<()> {
        instructions::freeze_account::freeze_handler(ctx)
    }

    /// Unfreeze a token account (Freezer role required)
    pub fn unfreeze_account(ctx: Context<FreezeTokenAccount>) -> Result<()> {
        instructions::freeze_account::unfreeze_handler(ctx)
    }

    /// Update token metadata field (Admin only)
    pub fn update_metadata(
        ctx: Context<UpdateMetadata>,
        field: String,
        value: String,
    ) -> Result<()> {
        instructions::update_metadata::handler(ctx, field, value)
    }

    /// Pause stablecoin operations (Admin only)
    pub fn pause(ctx: Context<Pause>) -> Result<()> {
        instructions::pause::pause_handler(ctx)
    }

    /// Unpause stablecoin operations (Admin only)
    pub fn unpause(ctx: Context<Pause>) -> Result<()> {
        instructions::pause::unpause_handler(ctx)
    }

    /// Transfer admin authority to a new key (Admin only)
    pub fn transfer_admin(ctx: Context<TransferAdmin>) -> Result<()> {
        instructions::transfer_admin::handler(ctx)
    }

    /// Seize tokens from one account to another using PermanentDelegate authority (Admin only)
    pub fn seize_tokens(ctx: Context<SeizeTokens>, amount: u64) -> Result<()> {
        instructions::seize_tokens::handler(ctx, amount)
    }

    /// Initialize optional hook/compliance module config for an existing mint.
    pub fn initialize_hook_module(ctx: Context<InitializeHookModule>) -> Result<()> {
        instructions::initialize_hook_module::handler(ctx)
    }

    /// Initialize the extra account meta list for transfer hook resolution.
    pub fn initialize_extra_account_meta_list(
        ctx: Context<InitializeExtraAccountMetaList>,
    ) -> Result<()> {
        instructions::transfer_hook::initialize_extra_account_meta_list_handler(ctx)
    }

    /// Add an address to the blacklist (hook authority only).
    pub fn add_to_blacklist(ctx: Context<AddToBlacklist>) -> Result<()> {
        instructions::add_to_blacklist::handler(ctx)
    }

    /// Remove an address from the blacklist (hook authority only).
    pub fn remove_from_blacklist(ctx: Context<RemoveFromBlacklist>) -> Result<()> {
        instructions::remove_from_blacklist::handler(ctx)
    }

    /// Enable or disable transfer-hook blacklist enforcement.
    pub fn set_compliance_mode(ctx: Context<SetComplianceMode>, enabled: bool) -> Result<()> {
        instructions::set_compliance_mode::handler(ctx, enabled)
    }

    /// Transfer hook authority to a new key.
    pub fn transfer_hook_authority(ctx: Context<TransferHookAuthority>) -> Result<()> {
        instructions::transfer_hook_authority::handler(ctx)
    }

    /// Transfer-hook execute callback invoked by Token-2022.
    pub fn transfer_hook(ctx: Context<TransferHook>, amount: u64) -> Result<()> {
        instructions::transfer_hook::handler(ctx, amount)
    }
}
