use anchor_lang::prelude::*;
use anchor_spl::{
    token_2022::Token2022,
    token_interface::{transfer_checked, Mint, TokenAccount, TransferChecked},
};

use crate::{
    errors::SssError,
    events::{AddressBlacklisted, AddressUnblacklisted, TokensSeized},
    state::{BlacklistEntry, StablecoinState},
};

// ─── Add to Blacklist ────────────────────────────────────────────────────────

#[derive(Accounts)]
#[instruction(reason: String)]
pub struct AddToBlacklist<'info> {
    pub authority: Signer<'info>,

    #[account(
        seeds = [b"stablecoin", state.mint.as_ref()],
        bump = state.bump,
        constraint = state.compliance_enabled @ SssError::ComplianceNotEnabled,
    )]
    pub state: Account<'info, StablecoinState>,

    /// CHECK: The address being blacklisted
    pub target: UncheckedAccount<'info>,

    #[account(
        init,
        payer = authority,
        space = BlacklistEntry::LEN,
        seeds = [b"blacklist", state.key().as_ref(), target.key().as_ref()],
        bump,
    )]
    pub blacklist_entry: Account<'info, BlacklistEntry>,

    pub system_program: Program<'info, System>,
}

pub fn add_to_blacklist_handler(ctx: Context<AddToBlacklist>, reason: String) -> Result<()> {
    require!(reason.len() <= 256, SssError::StringTooLong);

    let authority_key = ctx.accounts.authority.key();
    let state = &ctx.accounts.state;

    let is_authorized = authority_key == state.master_authority
        || state.blacklister.map_or(false, |b| b == authority_key);
    require!(is_authorized, SssError::Unauthorized);

    let entry = &mut ctx.accounts.blacklist_entry;
    entry.stablecoin = ctx.accounts.state.key();
    entry.address = ctx.accounts.target.key();
    entry.reason = reason.clone();
    entry.added_at = Clock::get()?.unix_timestamp;
    entry.added_by = authority_key;
    entry.active = true;
    entry.bump = ctx.bumps.blacklist_entry;

    emit!(AddressBlacklisted {
        mint: state.mint,
        address: ctx.accounts.target.key(),
        reason,
        blacklister: authority_key,
        timestamp: entry.added_at,
    });

    Ok(())
}

// ─── Remove from Blacklist ────────────────────────────────────────────────────

#[derive(Accounts)]
#[instruction(reason: String)]
pub struct RemoveFromBlacklist<'info> {
    pub authority: Signer<'info>,

    #[account(
        seeds = [b"stablecoin", state.mint.as_ref()],
        bump = state.bump,
        constraint = state.compliance_enabled @ SssError::ComplianceNotEnabled,
    )]
    pub state: Account<'info, StablecoinState>,

    /// CHECK: The address being removed from the blacklist
    pub target: UncheckedAccount<'info>,

    #[account(
        mut,
        seeds = [b"blacklist", state.key().as_ref(), target.key().as_ref()],
        bump = blacklist_entry.bump,
        constraint = blacklist_entry.active @ SssError::NotBlacklisted,
        close = authority,
    )]
    pub blacklist_entry: Account<'info, BlacklistEntry>,
}

pub fn remove_from_blacklist_handler(
    ctx: Context<RemoveFromBlacklist>,
    reason: String,
) -> Result<()> {
    let authority_key = ctx.accounts.authority.key();
    let state = &ctx.accounts.state;

    let is_authorized = authority_key == state.master_authority
        || state.blacklister.map_or(false, |b| b == authority_key);
    require!(is_authorized, SssError::Unauthorized);

    emit!(AddressUnblacklisted {
        mint: state.mint,
        address: ctx.accounts.target.key(),
        reason,
        blacklister: authority_key,
        timestamp: Clock::get()?.unix_timestamp,
    });

    Ok(())
}

// ─── Seize ───────────────────────────────────────────────────────────────────

#[derive(Accounts)]
pub struct Seize<'info> {
    pub authority: Signer<'info>,

    #[account(
        seeds = [b"stablecoin", state.mint.as_ref()],
        bump = state.bump,
        constraint = state.compliance_enabled @ SssError::ComplianceNotEnabled,
        constraint = state.permanent_delegate_enabled @ SssError::PermanentDelegateNotEnabled,
    )]
    pub state: Account<'info, StablecoinState>,

    pub mint: InterfaceAccount<'info, Mint>,

    /// Must be blacklisted
    /// CHECK: validated via blacklist PDA constraint
    pub target_wallet: UncheckedAccount<'info>,

    #[account(
        seeds = [b"blacklist", state.key().as_ref(), target_wallet.key().as_ref()],
        bump = blacklist_entry.bump,
        constraint = blacklist_entry.active @ SssError::SeizeRequiresBlacklist,
    )]
    pub blacklist_entry: Account<'info, BlacklistEntry>,

    #[account(
        mut,
        token::mint = mint,
        token::token_program = token_program,
        token::authority = target_wallet,
    )]
    pub from_token_account: InterfaceAccount<'info, TokenAccount>,

    #[account(
        mut,
        token::mint = mint,
        token::token_program = token_program,
    )]
    pub treasury_token_account: InterfaceAccount<'info, TokenAccount>,

    /// CHECK: Permanent delegate PDA — acts as universal delegate for SSS-2 tokens
    #[account(
        seeds = [b"permanent_delegate", state.key().as_ref()],
        bump,
    )]
    pub permanent_delegate: UncheckedAccount<'info>,

    pub token_program: Program<'info, Token2022>,
}

pub fn seize_handler(ctx: Context<Seize>) -> Result<()> {
    let authority_key = ctx.accounts.authority.key();
    let state = &ctx.accounts.state;

    let is_authorized = authority_key == state.master_authority
        || state.seizer.map_or(false, |s| s == authority_key);
    require!(is_authorized, SssError::Unauthorized);

    let amount = ctx.accounts.from_token_account.amount;
    require!(amount > 0, SssError::ZeroAmount);

    let state_key = ctx.accounts.state.key();
    let delegate_seeds = &[
        b"permanent_delegate",
        state_key.as_ref(),
        &[ctx.bumps.permanent_delegate],
    ];

    transfer_checked(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            TransferChecked {
                from: ctx.accounts.from_token_account.to_account_info(),
                mint: ctx.accounts.mint.to_account_info(),
                to: ctx.accounts.treasury_token_account.to_account_info(),
                authority: ctx.accounts.permanent_delegate.to_account_info(),
            },
            &[delegate_seeds],
        ),
        amount,
        ctx.accounts.mint.decimals,
    )?;

    emit!(TokensSeized {
        mint: ctx.accounts.mint.key(),
        from: ctx.accounts.target_wallet.key(),
        to: ctx.accounts.treasury_token_account.key(),
        amount,
        seizer: authority_key,
        timestamp: Clock::get()?.unix_timestamp,
    });

    Ok(())
}