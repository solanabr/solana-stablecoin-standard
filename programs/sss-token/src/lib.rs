use anchor_lang::prelude::*;

pub mod state;
pub mod errors;
pub mod instructions;

use instructions::*;
use state::{InitializeParams, MintFromBankParams, RedeemToBankParams};

declare_id!("2L6rZHyqhJ9VJqXhbgW7vyP3uerrw7Vzpp3qtqAq1FZj");

// Security disclosure info for on-chain scanners
#[cfg(not(feature = "no-entrypoint"))]
use solana_security_txt::security_txt;

#[cfg(not(feature = "no-entrypoint"))]
security_txt! {
    name: "Solana Stablecoin Standard (SSS)",
    project_url: "https://github.com/solanabr/solana-stablecoin-standard",
    contacts: "email:security@solanabr.org,discord:superteambr",
    policy: "https://github.com/solanabr/solana-stablecoin-standard/blob/main/SECURITY.md",
    preferred_languages: "en,pt",
    source_code: "https://github.com/solanabr/solana-stablecoin-standard",
    auditors: "Pending"
}

#[program]
pub mod sss_token {
    use super::*;

    // =========================================================================
    // CORE TOKEN OPERATIONS
    // =========================================================================

    pub fn initialize(
        ctx: Context<Initialize>,
        params: InitializeParams,
    ) -> Result<()> {
        instructions::initialize::handler(ctx, params)
    }

    pub fn mint_tokens(
        ctx: Context<MintTokens>,
        amount: u64,
    ) -> Result<()> {
        instructions::mint::handler(ctx, amount)
    }

    pub fn burn_tokens(
        ctx: Context<BurnTokens>,
        amount: u64,
    ) -> Result<()> {
        instructions::burn::handler(ctx, amount)
    }

    // =========================================================================
    // ACCOUNT MANAGEMENT
    // =========================================================================

    pub fn freeze_account(ctx: Context<FreezeTokenAccount>) -> Result<()> {
        instructions::freeze::freeze_handler(ctx)
    }

    pub fn thaw_account(ctx: Context<ThawTokenAccount>) -> Result<()> {
        instructions::freeze::thaw_handler(ctx)
    }

    pub fn pause(ctx: Context<PauseUnpause>) -> Result<()> {
        instructions::pause::pause_handler(ctx)
    }

    pub fn unpause(ctx: Context<PauseUnpause>) -> Result<()> {
        instructions::pause::unpause_handler(ctx)
    }

    // =========================================================================
    // ROLE MANAGEMENT
    // =========================================================================

    pub fn update_roles(
        ctx: Context<UpdateRoles>,
        target: Pubkey,
        role: u8,
        active: bool,
    ) -> Result<()> {
        instructions::roles::update_roles_handler(ctx, target, role, active)
    }

    pub fn update_minter_config(
        ctx: Context<UpdateMinterConfig>,
        minter: Pubkey,
        quota: u64,
    ) -> Result<()> {
        instructions::roles::update_minter_config_handler(ctx, minter, quota)
    }

    pub fn transfer_authority(
        ctx: Context<TransferAuthority>,
        new_authority: Pubkey,
    ) -> Result<()> {
        instructions::roles::transfer_authority_handler(ctx, new_authority)
    }

    /// Two-step authority transfer: Step 1 - Nominate new authority
    /// The new authority must call accept_authority to complete the transfer
    pub fn nominate_authority(
        ctx: Context<NominateAuthority>,
        new_authority: Pubkey,
    ) -> Result<()> {
        instructions::roles::nominate_authority_handler(ctx, new_authority)
    }

    /// Two-step authority transfer: Step 2 - Accept authority nomination
    /// Only the nominated authority can call this
    pub fn accept_authority(ctx: Context<AcceptAuthority>) -> Result<()> {
        instructions::roles::accept_authority_handler(ctx)
    }

    /// Update supply cap at runtime
    pub fn set_supply_cap(
        ctx: Context<SetSupplyCap>,
        new_cap: u64,
    ) -> Result<()> {
        instructions::roles::set_supply_cap_handler(ctx, new_cap)
    }

    // =========================================================================
    // COMPLIANCE (SSS-2+)
    // =========================================================================

    pub fn add_to_blacklist(
        ctx: Context<AddToBlacklist>,
        address: Pubkey,
    ) -> Result<()> {
        instructions::compliance::add_blacklist_handler(ctx, address)
    }

    pub fn remove_from_blacklist(
        ctx: Context<RemoveFromBlacklist>,
    ) -> Result<()> {
        instructions::compliance::remove_blacklist_handler(ctx)
    }

    pub fn seize<'info>(
        ctx: Context<'_, '_, '_, 'info, SeizeTokens<'info>>,
        amount: u64,
    ) -> Result<()> {
        instructions::compliance::seize_handler(ctx, amount)
    }

    // =========================================================================
    // BANKING RAILS: FIAT <-> STABLECOIN
    // =========================================================================

    /// Create mint request after receiving bank wire notification
    /// Flow: Bank deposit -> create_mint_request -> confirm_and_mint
    pub fn create_mint_request(
        ctx: Context<CreateMintRequest>,
        params: MintFromBankParams,
    ) -> Result<()> {
        instructions::banking::create_mint_request_handler(ctx, params)
    }

    /// Confirm bank deposit and mint stablecoins
    pub fn confirm_and_mint(ctx: Context<ConfirmAndMint>) -> Result<()> {
        instructions::banking::confirm_and_mint_handler(ctx)
    }

    /// Burn tokens and request fiat redemption
    /// Flow: create_redemption (burns tokens) -> complete_redemption (wire sent)
    pub fn create_redemption(
        ctx: Context<CreateRedemption>,
        params: RedeemToBankParams,
    ) -> Result<()> {
        instructions::banking::create_redemption_handler(ctx, params)
    }

    /// Mark redemption as completed after wire transfer
    pub fn complete_redemption(
        ctx: Context<CompleteRedemption>,
        wire_reference: [u8; 32],
    ) -> Result<()> {
        instructions::banking::complete_redemption_handler(ctx, wire_reference)
    }

    // =========================================================================
    // RESERVE ATTESTATION (PROOF OF RESERVES)
    // =========================================================================

    /// Submit proof-of-reserves attestation from oracle
    pub fn submit_attestation(
        ctx: Context<SubmitAttestation>,
        total_reserves: u64,
        valid_for_seconds: i64,
        ipfs_hash: [u8; 32],
    ) -> Result<()> {
        instructions::banking::submit_attestation_handler(
            ctx, total_reserves, valid_for_seconds, ipfs_hash
        )
    }

    // =========================================================================
    // ORACLE CONFIGURATION (Pyth Price Feed)
    // =========================================================================

    /// Configure oracle for on-chain price validation during mint/burn
    pub fn configure_oracle(
        ctx: Context<ConfigureOracle>,
        price_feed: Pubkey,
        max_staleness_seconds: u64,
        max_deviation_bps: u16,
        target_price: i64,
    ) -> Result<()> {
        instructions::oracle::configure_handler(
            ctx, price_feed, max_staleness_seconds, max_deviation_bps, target_price
        )
    }

    /// Toggle oracle validation on/off
    pub fn toggle_oracle(
        ctx: Context<ToggleOracle>,
        enabled: bool,
    ) -> Result<()> {
        instructions::oracle::toggle_handler(ctx, enabled)
    }

    /// Mint with oracle price validation (optional)
    pub fn mint_with_oracle(
        ctx: Context<MintWithOracle>,
        amount: u64,
    ) -> Result<()> {
        instructions::oracle::mint_with_oracle_handler(ctx, amount)
    }
}
