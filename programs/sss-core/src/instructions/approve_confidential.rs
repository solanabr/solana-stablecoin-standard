use anchor_lang::prelude::*;
use anchor_lang::solana_program::instruction::{AccountMeta, Instruction};
use anchor_lang::solana_program::program::invoke_signed;
use anchor_spl::token_2022::Token2022;
use anchor_spl::token_interface::{Mint, TokenAccount};

use crate::constants::*;
use crate::error::SSSError;
use crate::events::ConfidentialAccountApproved;
use crate::state::{AllowlistEntry, StablecoinConfig};

#[derive(Accounts)]
#[instruction(wallet: Pubkey)]
pub struct ApproveConfidential<'info> {
    /// Authority who approves confidential transfer accounts.
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        mut,
        seeds = [CONFIG_SEED, config.mint.as_ref()],
        bump = config.bump,
        constraint = authority.key() == config.authority @ SSSError::NotAuthority,
        constraint = config.preset >= PRESET_CONFIDENTIAL @ SSSError::PresetFeatureUnavailable,
        constraint = !config.paused @ SSSError::Paused,
    )]
    pub config: Account<'info, StablecoinConfig>,

    #[account(address = config.mint)]
    pub mint: InterfaceAccount<'info, Mint>,

    /// The Token-2022 token account to approve for confidential transfers.
    /// Must be owned by `wallet` and associated with the stablecoin mint.
    #[account(
        mut,
        token::mint = mint,
        token::authority = wallet,
    )]
    pub token_account: InterfaceAccount<'info, TokenAccount>,

    /// AllowlistEntry PDA — tracks approval state for this wallet.
    #[account(
        init_if_needed,
        payer = authority,
        space = 8 + AllowlistEntry::INIT_SPACE,
        seeds = [ALLOWLIST_SEED, mint.key().as_ref(), wallet.as_ref()],
        bump,
    )]
    pub allowlist_entry: Account<'info, AllowlistEntry>,

    /// Mint authority PDA — acts as confidential transfer authority.
    /// CHECK: PDA validated by seeds.
    #[account(
        seeds = [MINT_AUTHORITY_SEED, mint.key().as_ref()],
        bump = config.mint_authority_bump,
    )]
    pub mint_authority: SystemAccount<'info>,

    pub token_program: Program<'info, Token2022>,
    pub system_program: Program<'info, System>,
}

pub fn handle_approve_confidential(
    ctx: Context<ApproveConfidential>,
    wallet: Pubkey,
) -> Result<()> {
    // ── 1. VALIDATE ─────────────────────────────────────────────────────────
    // If the allowlist entry already exists and is approved, reject.
    // (A fresh `init_if_needed` account has `approved = false`, so this only
    // fires for genuine re-approvals of an already-approved entry.)
    let entry = &ctx.accounts.allowlist_entry;
    if entry.approved {
        return Err(SSSError::AlreadyApproved.into());
    }

    // ── 2. EXECUTE CPI: Approve account for confidential transfers ──────────
    // Token-2022 ConfidentialTransferExtension::ApproveAccount
    // Data: [27 (ConfidentialTransferExtension), 3 (ApproveAccount)]
    // Accounts: [writable] token_account, [] mint, [signer] authority
    let approve_ix = Instruction {
        program_id: ctx.accounts.token_program.key(),
        accounts: vec![
            AccountMeta::new(ctx.accounts.token_account.key(), false),
            AccountMeta::new_readonly(ctx.accounts.mint.key(), false),
            AccountMeta::new_readonly(ctx.accounts.mint_authority.key(), true),
        ],
        data: vec![27, 3],
    };

    let mint_key = ctx.accounts.mint.key();
    let signer_seeds: &[&[&[u8]]] = &[&[
        MINT_AUTHORITY_SEED,
        mint_key.as_ref(),
        &[ctx.accounts.config.mint_authority_bump],
    ]];

    invoke_signed(
        &approve_ix,
        &[
            ctx.accounts.token_account.to_account_info(),
            ctx.accounts.mint.to_account_info(),
            ctx.accounts.mint_authority.to_account_info(),
        ],
        signer_seeds,
    )?;

    // ── 3. UPDATE STATE: Populate allowlist entry ────────────────────────────
    let allowlist_entry = &mut ctx.accounts.allowlist_entry;
    allowlist_entry.mint = ctx.accounts.mint.key();
    allowlist_entry.wallet = wallet;
    allowlist_entry.approved = true;
    allowlist_entry.approved_by = ctx.accounts.authority.key();
    allowlist_entry.approved_at = Clock::get()?.unix_timestamp;
    allowlist_entry.bump = ctx.bumps.allowlist_entry;

    // ── 4. EMIT EVENT ───────────────────────────────────────────────────────
    emit!(ConfidentialAccountApproved {
        mint: ctx.accounts.mint.key(),
        wallet,
        token_account: ctx.accounts.token_account.key(),
        approved_by: ctx.accounts.authority.key(),
    });

    Ok(())
}
