use anchor_lang::prelude::*;
use anchor_spl::token_interface::Mint;

use crate::constants::*;
use crate::error::SSSError;
use crate::events::ConfidentialAccountRevoked;
use crate::state::{AllowlistEntry, StablecoinConfig};

#[derive(Accounts)]
pub struct RevokeConfidential<'info> {
    /// Authority who revokes confidential transfer approval.
    pub authority: Signer<'info>,

    // Note: No pause check — revocation is an authority-level compliance action
    // that should succeed even during a global pause (like freeze/thaw).
    #[account(
        seeds = [CONFIG_SEED, config.mint.as_ref()],
        bump = config.bump,
        constraint = authority.key() == config.authority @ SSSError::NotAuthority,
        constraint = config.preset >= PRESET_CONFIDENTIAL @ SSSError::PresetFeatureUnavailable,
    )]
    pub config: Account<'info, StablecoinConfig>,

    #[account(address = config.mint)]
    pub mint: InterfaceAccount<'info, Mint>,

    /// AllowlistEntry PDA — must be currently approved.
    #[account(
        mut,
        seeds = [ALLOWLIST_SEED, mint.key().as_ref(), allowlist_entry.wallet.as_ref()],
        bump = allowlist_entry.bump,
        constraint = allowlist_entry.approved @ SSSError::NotApproved,
    )]
    pub allowlist_entry: Account<'info, AllowlistEntry>,
}

pub fn handle_revoke_confidential(ctx: Context<RevokeConfidential>) -> Result<()> {
    // ── 1. UPDATE STATE: Mark as revoked ─────────────────────────────────────
    let allowlist_entry = &mut ctx.accounts.allowlist_entry;
    allowlist_entry.approved = false;

    // ── 2. EMIT EVENT ───────────────────────────────────────────────────────
    emit!(ConfidentialAccountRevoked {
        mint: ctx.accounts.mint.key(),
        wallet: allowlist_entry.wallet,
        revoked_by: ctx.accounts.authority.key(),
    });

    Ok(())
}
