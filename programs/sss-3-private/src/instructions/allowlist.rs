use anchor_lang::prelude::*;
use crate::state::{AllowlistEntry, PrivateStablecoinState};
use crate::errors::SSSPrivateError;
use crate::events::{AllowlistApprovedEvent, AllowlistRevokedEvent};

// ─── Approve Allowlist ───────────────────────────────────────────────────────

#[derive(Accounts)]
pub struct ApproveAllowlist<'info> {
    /// The authority managing this stablecoin
    #[account(mut)]
    pub authority: Signer<'info>,

    /// The private stablecoin state
    #[account(
        mut,
        has_one = authority @ SSSPrivateError::Unauthorized,
    )]
    pub state: Account<'info, PrivateStablecoinState>,

    /// The wallet to approve for confidential transfers
    /// CHECK: This is the wallet being added to the allowlist
    pub wallet: UncheckedAccount<'info>,

    /// The allowlist entry PDA to create
    #[account(
        init,
        payer = authority,
        space = AllowlistEntry::SIZE,
        seeds = [b"allowlist", state.key().as_ref(), wallet.key().as_ref()],
        bump,
    )]
    pub allowlist_entry: Account<'info, AllowlistEntry>,

    pub system_program: Program<'info, System>,
}

pub fn approve_handler(ctx: Context<ApproveAllowlist>, kyc_provider: String) -> Result<()> {
    require!(kyc_provider.len() <= 32, SSSPrivateError::KycProviderTooLong);
    require!(!ctx.accounts.state.paused, SSSPrivateError::Paused);

    let clock = Clock::get()?;
    let entry = &mut ctx.accounts.allowlist_entry;

    entry.state = ctx.accounts.state.key();
    entry.wallet = ctx.accounts.wallet.key();
    entry.approved = true;
    entry.approved_at = clock.unix_timestamp;
    entry.revoked_at = 0;
    entry.kyc_provider = kyc_provider.clone();
    entry.revocation_reason = String::new();
    entry.bump = ctx.bumps.allowlist_entry;

    // Increment allowlist count
    let state = &mut ctx.accounts.state;
    state.allowlist_count = state.allowlist_count.checked_add(1).unwrap();

    // NOTE: In production, this would also call:
    //   spl_token_2022::extension::confidential_transfer::instruction::approve_account(...)
    // to enable confidential transfers for this wallet's token account.

    msg!(
        "SSS-3: Approved {} for confidential transfers (KYC: {})",
        ctx.accounts.wallet.key(),
        kyc_provider
    );

    emit!(AllowlistApprovedEvent {
        state: state.key(),
        wallet: ctx.accounts.wallet.key(),
        kyc_provider,
        approved_by: ctx.accounts.authority.key(),
        timestamp: clock.unix_timestamp,
    });

    Ok(())
}

// ─── Revoke Allowlist ────────────────────────────────────────────────────────

#[derive(Accounts)]
pub struct RevokeAllowlist<'info> {
    /// The authority managing this stablecoin
    #[account(mut)]
    pub authority: Signer<'info>,

    /// The private stablecoin state
    #[account(
        mut,
        has_one = authority @ SSSPrivateError::Unauthorized,
    )]
    pub state: Account<'info, PrivateStablecoinState>,

    /// The wallet being revoked
    /// CHECK: This is the wallet being removed from the allowlist
    pub wallet: UncheckedAccount<'info>,

    /// The allowlist entry PDA to update
    #[account(
        mut,
        seeds = [b"allowlist", state.key().as_ref(), wallet.key().as_ref()],
        bump = allowlist_entry.bump,
        constraint = allowlist_entry.approved @ SSSPrivateError::AllowlistRevoked,
    )]
    pub allowlist_entry: Account<'info, AllowlistEntry>,
}

pub fn revoke_handler(ctx: Context<RevokeAllowlist>, reason: String) -> Result<()> {
    require!(reason.len() <= 128, SSSPrivateError::RevocationReasonTooLong);

    let clock = Clock::get()?;
    let entry = &mut ctx.accounts.allowlist_entry;

    entry.approved = false;
    entry.revoked_at = clock.unix_timestamp;
    entry.revocation_reason = reason.clone();

    // Decrement allowlist count
    let state = &mut ctx.accounts.state;
    state.allowlist_count = state.allowlist_count.saturating_sub(1);

    msg!(
        "SSS-3: Revoked {} from confidential transfers: {}",
        ctx.accounts.wallet.key(),
        reason
    );

    emit!(AllowlistRevokedEvent {
        state: state.key(),
        wallet: ctx.accounts.wallet.key(),
        reason,
        revoked_by: ctx.accounts.authority.key(),
        timestamp: clock.unix_timestamp,
    });

    Ok(())
}
