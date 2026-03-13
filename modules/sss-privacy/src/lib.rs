//! SSS-3: Private Stablecoin Module (Experimental / Proof-of-Concept)
//!
//! This module demonstrates how confidential transfers and scoped allowlists
//! could work with the SSS framework. Token-2022 confidential transfer tooling
//! is still maturing, so this serves as a design reference and proof-of-concept.
//!
//! ## Concept
//!
//! SSS-3 = SSS-1 + Confidential Transfers + Scoped Allowlists
//!
//! - **Confidential transfers**: Transfer amounts are encrypted using ElGamal
//!   encryption. Only the sender, receiver, and auditor can see amounts.
//! - **Scoped allowlists**: Only addresses on the allowlist can participate in
//!   confidential transfers. This provides a privacy-preserving compliance layer.
//!
//! ## Limitations
//!
//! - Token-2022 confidential transfer extension is still experimental
//! - ZK proof generation requires specialized client-side libraries
//! - Not all wallets support confidential transfers
//! - Performance: ZK proofs add latency to transfers

use anchor_lang::prelude::*;

declare_id!("SSSPrivXhFBpMVB1YcqhjQk1iWKA1dqHkST6hamGqmz");

pub const ALLOWLIST_SEED: &[u8] = b"allowlist";
pub const PRIVACY_CONFIG_SEED: &[u8] = b"privacy_config";

/// Privacy configuration for a stablecoin.
/// Controls which addresses can use confidential transfers.
#[account]
pub struct PrivacyConfig {
    /// The stablecoin config this privacy module is attached to
    pub stablecoin: Pubkey,
    /// Authority who can manage the allowlist
    pub authority: Pubkey,
    /// Whether confidential transfers are enabled
    pub enabled: bool,
    /// Auditor ElGamal public key (can decrypt all transfer amounts)
    pub auditor_elgamal_pubkey: [u8; 32],
    /// Maximum transfer amount for confidential transfers
    pub max_confidential_amount: u64,
    /// PDA bump
    pub bump: u8,
}

impl PrivacyConfig {
    pub const LEN: usize = 8 + 32 + 32 + 1 + 32 + 8 + 1;
}

/// Allowlist entry — marks an address as approved for confidential transfers.
#[account]
pub struct AllowlistEntry {
    /// The privacy config this entry belongs to
    pub privacy_config: Pubkey,
    /// The approved address
    pub account: Pubkey,
    /// Approved by
    pub approved_by: Pubkey,
    /// Approval timestamp
    pub approved_at: i64,
    /// PDA bump
    pub bump: u8,
}

impl AllowlistEntry {
    pub const LEN: usize = 8 + 32 + 32 + 32 + 8 + 1;
}

#[program]
pub mod sss_privacy {
    use super::*;

    /// Initialize the privacy configuration for a stablecoin.
    /// This is a proof-of-concept — in production, this would also configure
    /// the Token-2022 confidential transfer extension on the mint.
    pub fn initialize_privacy(
        ctx: Context<InitializePrivacy>,
        auditor_elgamal_pubkey: [u8; 32],
        max_confidential_amount: u64,
    ) -> Result<()> {
        let config = &mut ctx.accounts.privacy_config;
        config.stablecoin = ctx.accounts.stablecoin_config.key();
        config.authority = ctx.accounts.authority.key();
        config.enabled = true;
        config.auditor_elgamal_pubkey = auditor_elgamal_pubkey;
        config.max_confidential_amount = max_confidential_amount;
        config.bump = ctx.bumps.privacy_config;
        Ok(())
    }

    /// Add an address to the confidential transfer allowlist.
    pub fn add_to_allowlist(
        ctx: Context<ManageAllowlist>,
        account: Pubkey,
    ) -> Result<()> {
        let entry = &mut ctx.accounts.allowlist_entry;
        entry.privacy_config = ctx.accounts.privacy_config.key();
        entry.account = account;
        entry.approved_by = ctx.accounts.authority.key();
        entry.approved_at = Clock::get()?.unix_timestamp;
        entry.bump = ctx.bumps.allowlist_entry;
        Ok(())
    }

    /// Remove an address from the confidential transfer allowlist.
    pub fn remove_from_allowlist(
        _ctx: Context<RemoveAllowlist>,
        _account: Pubkey,
    ) -> Result<()> {
        // Account is closed by the `close` attribute
        Ok(())
    }

    /// Toggle privacy module on/off.
    pub fn toggle_privacy(ctx: Context<TogglePrivacy>, enabled: bool) -> Result<()> {
        ctx.accounts.privacy_config.enabled = enabled;
        Ok(())
    }
}

#[derive(Accounts)]
pub struct InitializePrivacy<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    /// CHECK: The stablecoin config from the main program
    pub stablecoin_config: UncheckedAccount<'info>,

    #[account(
        init,
        payer = authority,
        space = PrivacyConfig::LEN,
        seeds = [PRIVACY_CONFIG_SEED, stablecoin_config.key().as_ref()],
        bump,
    )]
    pub privacy_config: Account<'info, PrivacyConfig>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(account: Pubkey)]
pub struct ManageAllowlist<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        constraint = privacy_config.authority == authority.key(),
        constraint = privacy_config.enabled,
    )]
    pub privacy_config: Account<'info, PrivacyConfig>,

    #[account(
        init,
        payer = authority,
        space = AllowlistEntry::LEN,
        seeds = [ALLOWLIST_SEED, privacy_config.key().as_ref(), account.as_ref()],
        bump,
    )]
    pub allowlist_entry: Account<'info, AllowlistEntry>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(account: Pubkey)]
pub struct RemoveAllowlist<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        constraint = privacy_config.authority == authority.key(),
    )]
    pub privacy_config: Account<'info, PrivacyConfig>,

    #[account(
        mut,
        close = authority,
        seeds = [ALLOWLIST_SEED, privacy_config.key().as_ref(), account.as_ref()],
        bump = allowlist_entry.bump,
    )]
    pub allowlist_entry: Account<'info, AllowlistEntry>,
}

#[derive(Accounts)]
pub struct TogglePrivacy<'info> {
    pub authority: Signer<'info>,

    #[account(
        mut,
        constraint = privacy_config.authority == authority.key(),
    )]
    pub privacy_config: Account<'info, PrivacyConfig>,
}
