//! SSS-3: Private Stablecoin — Proof of Concept
//!
//! Extends SSS-2 with Token-2022 ConfidentialTransfer extension and a
//! permit-only allowlist enforced via transfer hook.
//!
//! STATUS: Experimental. ZK proof CPIs are stubbed pending stable toolchain.
//! See docs/SSS-3.md for full architecture and design rationale.

use anchor_lang::prelude::*;

pub mod error;
pub mod state;

use state::*;

declare_id!("SSS3PrivatefXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX");

pub const PRIVATE_CONFIG_SEED: &[u8] = b"private-config";
pub const ALLOWLIST_SEED: &[u8] = b"allowlist";

#[program]
pub mod sss_private {
    use super::*;

    /// Initialize an SSS-3 private stablecoin mint.
    ///
    /// Creates a Token-2022 mint with:
    /// - ConfidentialTransferMint extension (auditor key, manual approval)
    /// - TransferHook extension pointing to a hook that checks AllowlistEntry PDAs
    /// - MetadataPointer + TokenMetadata (same as SSS-1/SSS-2)
    /// - PermanentDelegate = config PDA (same as SSS-2 for seizure)
    ///
    /// STUB: ConfidentialTransfer initialization requires spl-token-2022 >= 4.0
    /// and is currently called via raw CPI. The ZK proof tooling is still
    /// maturing; this instruction will be fully implemented when the upstream
    /// crate stabilises.
    pub fn initialize_private(
        ctx: Context<InitializePrivate>,
        params: InitializePrivateParams,
    ) -> Result<()> {
        let config = &mut ctx.accounts.config;
        config.authority = ctx.accounts.authority.key();
        config.mint = ctx.accounts.mint.key();
        config.auditor_elgamal_pubkey = params.auditor_elgamal_pubkey;
        config.allowlister = params.allowlister;
        config.bump = ctx.bumps.config;

        emit!(PrivateMintInitialized {
            mint: ctx.accounts.mint.key(),
            authority: ctx.accounts.authority.key(),
        });

        // TODO: CPI sequence:
        // 1. system_program::create_account (mint with extension space)
        // 2. confidential_transfer::initialize_mint (auditor key, auto_approve=false)
        // 3. transfer_hook::initialize (hook program id)
        // 4. permanent_delegate::initialize (config PDA)
        // 5. metadata_pointer::initialize
        // 6. token_2022::initialize_mint
        // 7. token_metadata::initialize (invoke_signed with config PDA)

        Ok(())
    }

    /// Approve a token account for confidential transfers (KYC gate).
    ///
    /// Creates an AllowlistEntry PDA. The transfer hook will reject any transfer
    /// whose destination does not have a corresponding AllowlistEntry.
    ///
    /// Only the allowlister role (or authority) can call this.
    pub fn approve_account(ctx: Context<ApproveAccount>) -> Result<()> {
        let entry = &mut ctx.accounts.allowlist_entry;
        entry.token_account = ctx.accounts.token_account.key();
        entry.approved_at = Clock::get()?.unix_timestamp;
        entry.bump = ctx.bumps.allowlist_entry;

        emit!(AccountApproved {
            mint: ctx.accounts.config.mint,
            token_account: ctx.accounts.token_account.key(),
        });

        // TODO: CPI to confidential_transfer::approve_account
        // This configures the token account to accept confidential transfers.

        Ok(())
    }

    /// Revoke allowlist approval for a token account.
    ///
    /// Closes the AllowlistEntry PDA. Future confidential transfers to this
    /// account will be rejected by the transfer hook.
    pub fn revoke_account(ctx: Context<RevokeAccount>) -> Result<()> {
        emit!(AccountRevoked {
            mint: ctx.accounts.config.mint,
            token_account: ctx.accounts.allowlist_entry.token_account,
        });
        // Account is closed by Anchor (#[account(close = allowlister)])
        Ok(())
    }

    /// Deposit public tokens into confidential balance.
    ///
    /// Moves `amount` from the token account's public balance into its
    /// pending confidential balance. No ZK proof required for deposit.
    pub fn deposit_confidential(
        _ctx: Context<DepositConfidential>,
        _amount: u64,
    ) -> Result<()> {
        // TODO: CPI to confidential_transfer::deposit
        // spl_token_2022::instruction::confidential_transfer::deposit(...)
        err!(error::SssPrivateError::NotYetImplemented)
    }

    /// Withdraw confidential balance back to public balance.
    ///
    /// Requires a ZK range proof and equality proof generated client-side.
    /// Proofs must be pre-verified via the ZkElGamalProof program before
    /// calling this instruction.
    pub fn withdraw_confidential(
        _ctx: Context<WithdrawConfidential>,
        _amount: u64,
        _proof_instruction_offset: i8,
    ) -> Result<()> {
        // TODO: CPI to confidential_transfer::withdraw
        // Validates proof_instruction_offset points to a valid ZK proof
        err!(error::SssPrivateError::NotYetImplemented)
    }
}

// ─── Account structs ─────────────────────────────────────────────────────────

#[derive(Accounts)]
pub struct InitializePrivate<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    /// CHECK: new mint keypair; initialized in this instruction via CPI
    #[account(mut)]
    pub mint: UncheckedAccount<'info>,

    #[account(
        init,
        payer = authority,
        space = 8 + PrivateStablecoinConfig::LEN,
        seeds = [PRIVATE_CONFIG_SEED, mint.key().as_ref()],
        bump,
    )]
    pub config: Account<'info, PrivateStablecoinConfig>,

    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
pub struct ApproveAccount<'info> {
    pub allowlister: Signer<'info>,

    #[account(
        seeds = [PRIVATE_CONFIG_SEED, config.mint.as_ref()],
        bump = config.bump,
        constraint = config.allowlister == Some(allowlister.key()) || config.authority == allowlister.key()
            @ error::SssPrivateError::Unauthorized,
    )]
    pub config: Account<'info, PrivateStablecoinConfig>,

    /// CHECK: the Token-2022 token account to approve
    pub token_account: UncheckedAccount<'info>,

    #[account(
        init,
        payer = allowlister,
        space = 8 + AllowlistEntry::LEN,
        seeds = [ALLOWLIST_SEED, config.mint.as_ref(), token_account.key().as_ref()],
        bump,
    )]
    pub allowlist_entry: Account<'info, AllowlistEntry>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct RevokeAccount<'info> {
    pub allowlister: Signer<'info>,

    #[account(
        seeds = [PRIVATE_CONFIG_SEED, config.mint.as_ref()],
        bump = config.bump,
        constraint = config.allowlister == Some(allowlister.key()) || config.authority == allowlister.key()
            @ error::SssPrivateError::Unauthorized,
    )]
    pub config: Account<'info, PrivateStablecoinConfig>,

    #[account(
        mut,
        seeds = [ALLOWLIST_SEED, config.mint.as_ref(), allowlist_entry.token_account.as_ref()],
        bump = allowlist_entry.bump,
        close = allowlister,
    )]
    pub allowlist_entry: Account<'info, AllowlistEntry>,
}

#[derive(Accounts)]
pub struct DepositConfidential<'info> {
    pub owner: Signer<'info>,
    /// CHECK: Token-2022 token account
    #[account(mut)]
    pub token_account: UncheckedAccount<'info>,
    /// CHECK: Token-2022 mint
    #[account(mut)]
    pub mint: UncheckedAccount<'info>,
}

#[derive(Accounts)]
pub struct WithdrawConfidential<'info> {
    pub owner: Signer<'info>,
    /// CHECK: Token-2022 token account
    #[account(mut)]
    pub token_account: UncheckedAccount<'info>,
    /// CHECK: Token-2022 mint
    #[account(mut)]
    pub mint: UncheckedAccount<'info>,
}

// ─── Params ──────────────────────────────────────────────────────────────────

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct InitializePrivateParams {
    pub name: String,
    pub symbol: String,
    pub uri: String,
    pub decimals: u8,
    /// 32-byte ElGamal public key of the auditor.
    /// The auditor can decrypt all confidential transfer amounts.
    pub auditor_elgamal_pubkey: [u8; 32],
    pub allowlister: Option<Pubkey>,
}

// ─── Events ──────────────────────────────────────────────────────────────────

#[event]
pub struct PrivateMintInitialized {
    pub mint: Pubkey,
    pub authority: Pubkey,
}

#[event]
pub struct AccountApproved {
    pub mint: Pubkey,
    pub token_account: Pubkey,
}

#[event]
pub struct AccountRevoked {
    pub mint: Pubkey,
    pub token_account: Pubkey,
}
