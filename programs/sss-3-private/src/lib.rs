use anchor_lang::prelude::*;

pub mod state;
pub mod errors;
pub mod events;
pub mod instructions;

use instructions::*;

declare_id!("SSS3priv11111111111111111111111111111111111");

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
    ///
    /// Creates a Token-2022 mint with ConfidentialTransferMint extension
    /// and initializes the on-chain PrivateStablecoinState.
    pub fn initialize_private(
        ctx: Context<InitializePrivate>,
        params: InitPrivateParams,
    ) -> Result<()> {
        instructions::initialize::handler(ctx, params)
    }

    /// Approve an address for confidential transfers (KYC allowlist).
    ///
    /// Only the authority can call this. Creates an AllowlistEntry PDA
    /// marking the address as approved for confidential operations.
    pub fn approve_allowlist(
        ctx: Context<ApproveAllowlist>,
        kyc_provider: String,
    ) -> Result<()> {
        instructions::allowlist::approve_handler(ctx, kyc_provider)
    }

    /// Revoke an address from the confidential transfer allowlist.
    ///
    /// Marks the AllowlistEntry as revoked. The address can no longer
    /// deposit to or transfer from confidential balance.
    pub fn revoke_allowlist(
        ctx: Context<RevokeAllowlist>,
        reason: String,
    ) -> Result<()> {
        instructions::allowlist::revoke_handler(ctx, reason)
    }

    /// Deposit public token balance into confidential (encrypted) balance.
    ///
    /// Requires the sender to be on the allowlist. Moves tokens from
    /// the public balance to the confidential balance on the same ATA.
    pub fn deposit_to_confidential(
        ctx: Context<DepositToConfidential>,
        amount: u64,
    ) -> Result<()> {
        instructions::transfer::deposit_handler(ctx, amount)
    }

    /// Withdraw from confidential balance back to public balance.
    ///
    /// Requires a zero-knowledge proof that the confidential balance is
    /// sufficient. The proof is verified on-chain.
    pub fn withdraw_to_public(
        ctx: Context<WithdrawToPublic>,
        amount: u64,
        proof_data: Vec<u8>,
    ) -> Result<()> {
        instructions::transfer::withdraw_handler(ctx, amount, proof_data)
    }

    /// Rotate the auditor ElGamal public key.
    ///
    /// Only the authority can update the auditor key. The new auditor
    /// will be able to decrypt future transfer amounts.
    pub fn update_auditor(
        ctx: Context<UpdateAuditor>,
        new_auditor_elgamal_pubkey: [u8; 32],
    ) -> Result<()> {
        instructions::admin::update_auditor_handler(ctx, new_auditor_elgamal_pubkey)
    }
}
