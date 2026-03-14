use anchor_lang::prelude::*;

pub mod state;
pub mod errors;
pub mod events;
pub mod instructions;

use instructions::*;

declare_id!("4ea2tTJiMRW3Nov8K4hEd3JPppiY1oPU2p5zri8JAnkX");

/// SSS-3 Private Stablecoin Standard — Proof of Concept
///
/// Extends SSS-1/SSS-2 with confidential transfers (Token-2022 ConfidentialTransferMint)
/// and scoped allowlists for regulatory-compliant privacy.
///
/// ## Architecture
///
/// - **Confidential Transfers**: Uses Token-2022's ElGamal-based encryption to hide
///   transfer amounts while keeping sender/recipient visible on-chain.
///
/// - **Scoped Allowlists**: Only KYC'd addresses (approved via `approve_allowlist`)
///   can participate in confidential transfers. Auto-approve is disabled by default.
///
/// - **Auditor Key**: A designated auditor ElGamal key can decrypt all transfer
///   amounts for regulatory reporting.
///
/// ## Status
///
/// This is a **proof-of-concept**. The SPL ConfidentialTransfer extension and
/// `solana-zk-sdk` are still maturing. This program demonstrates the architecture
/// and instruction set needed for production deployment once tooling is stable.
#[program]
pub mod sss_3_private {
    use super::*;

    /// Initialize a new SSS-3 private stablecoin mint.
    pub fn initialize_private(
        ctx: Context<InitializePrivate>,
        params: InitPrivateParams,
    ) -> Result<()> {
        instructions::initialize::handler(ctx, params)
    }

    /// Approve an address for confidential transfers (KYC allowlist).
    pub fn approve_allowlist(
        ctx: Context<ApproveAllowlist>,
        kyc_provider: String,
    ) -> Result<()> {
        instructions::allowlist::approve_handler(ctx, kyc_provider)
    }

    /// Revoke an address from the confidential transfer allowlist.
    pub fn revoke_allowlist(
        ctx: Context<RevokeAllowlist>,
        reason: String,
    ) -> Result<()> {
        instructions::allowlist::revoke_handler(ctx, reason)
    }

    /// Deposit public token balance into confidential (encrypted) balance.
    pub fn deposit_to_confidential(
        ctx: Context<DepositToConfidential>,
        amount: u64,
    ) -> Result<()> {
        instructions::transfer::deposit_handler(ctx, amount)
    }

    /// Withdraw from confidential balance back to public balance.
    pub fn withdraw_to_public(
        ctx: Context<WithdrawToPublic>,
        amount: u64,
        proof_data: Vec<u8>,
    ) -> Result<()> {
        instructions::transfer::withdraw_handler(ctx, amount, proof_data)
    }

    /// Rotate the auditor ElGamal public key.
    pub fn update_auditor(
        ctx: Context<UpdateAuditor>,
        new_auditor_elgamal_pubkey: [u8; 32],
    ) -> Result<()> {
        instructions::admin::update_auditor_handler(ctx, new_auditor_elgamal_pubkey)
    }

    /// Pause the stablecoin — halts all deposits, withdrawals, and mints.
    pub fn pause(ctx: Context<PausePrivate>) -> Result<()> {
        instructions::admin::pause_handler(ctx)
    }

    /// Unpause the stablecoin.
    pub fn unpause(ctx: Context<UnpausePrivate>) -> Result<()> {
        instructions::admin::unpause_handler(ctx)
    }

    /// Propose a new authority (step 1 of two-step transfer).
    pub fn propose_authority(
        ctx: Context<ProposeAuthority>,
        new_authority: Pubkey,
    ) -> Result<()> {
        instructions::admin::propose_authority_handler(ctx, new_authority)
    }

    /// Accept a pending authority transfer (step 2 of two-step transfer).
    pub fn accept_authority(ctx: Context<AcceptAuthority>) -> Result<()> {
        instructions::admin::accept_authority_handler(ctx)
    }

    /// Mint tokens to an allowlisted recipient.
    ///
    /// Only the authority can mint in SSS-3 (PoC). In production, a
    /// dedicated minter role with quotas would be added (like SSS-1).
    pub fn mint_tokens(
        ctx: Context<MintTokensPrivate>,
        amount: u64,
    ) -> Result<()> {
        instructions::admin::mint_tokens_handler(ctx, amount)
    }

    /// Burn tokens from a token account.
    ///
    /// Owner can self-burn; authority can force-burn via permanent delegate.
    pub fn burn_tokens(
        ctx: Context<BurnTokensPrivate>,
        amount: u64,
    ) -> Result<()> {
        instructions::admin::burn_tokens_handler(ctx, amount)
    }
}
