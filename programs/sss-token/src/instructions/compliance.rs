use anchor_lang::prelude::*;
use anchor_lang::solana_program::{
    program::invoke_signed,
    instruction::{AccountMeta, Instruction},
};
use anchor_spl::{
    token_2022::Token2022,
    token_interface::{Mint, TokenAccount},
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
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        mut,
        seeds = [b"stablecoin", state.mint.as_ref()],
        bump = state.bump,
    )]
    pub state: Account<'info, StablecoinState>,

    /// CHECK: The address being blacklisted
    pub target: UncheckedAccount<'info>,

    #[account(
        init_if_needed,
        payer = authority,
        space = BlacklistEntry::LEN,
        seeds = [
            b"blacklist",
            state.key().as_ref(),
            target.key().as_ref(),
        ],
        bump,
    )]
    pub blacklist_entry: Account<'info, BlacklistEntry>,

    pub system_program: Program<'info, System>,
}

pub fn add_to_blacklist_handler(ctx: Context<AddToBlacklist>, reason: String) -> Result<()> {
    require!(reason.len() <= 256, SssError::StringTooLong);
    require!(ctx.accounts.state.compliance_enabled, SssError::ComplianceNotEnabled);

    let authority_key = ctx.accounts.authority.key();
    let state = &ctx.accounts.state;

    let is_authorized = state.blacklister.map_or(false, |b| b == authority_key);
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
        mut,
        seeds = [b"stablecoin", state.mint.as_ref()],
        bump = state.bump,
    )]
    pub state: Account<'info, StablecoinState>,

    /// CHECK: The address being removed from the blacklist
    pub target: UncheckedAccount<'info>,

    #[account(
        mut,
        close = authority,
        seeds = [
            b"blacklist",
            state.key().as_ref(),
            target.key().as_ref(),
        ],
        bump = blacklist_entry.bump,
    )]
    pub blacklist_entry: Account<'info, BlacklistEntry>,
}

pub fn remove_from_blacklist_handler(
    ctx: Context<RemoveFromBlacklist>,
    reason: String,
) -> Result<()> {
    require!(ctx.accounts.state.compliance_enabled, SssError::ComplianceNotEnabled);
    require!(ctx.accounts.blacklist_entry.active, SssError::NotBlacklisted);
    
    let authority_key = ctx.accounts.authority.key();
    let state = &ctx.accounts.state;

    let is_authorized = state.blacklister.map_or(false, |b| b == authority_key);
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

pub fn seize_handler<'info>(ctx: Context<'_, '_, 'info, 'info, Seize<'info>>) -> Result<()> {
    let authority_key = ctx.accounts.authority.key();
    let state = &ctx.accounts.state;

    let is_authorized = state.seizer.map_or(false, |s| s == authority_key);
    require!(is_authorized, SssError::Unauthorized);

    let amount = ctx.accounts.from_token_account.amount;
    require!(amount > 0, SssError::ZeroAmount);

    let state_key = ctx.accounts.state.key();
    let bump = ctx.bumps.permanent_delegate;
    let delegate_seeds: &[&[u8]] = &[
        b"permanent_delegate",
        state_key.as_ref(),
        &[bump],
    ];
    let signer_seeds = &[delegate_seeds];

    // Build TransferChecked instruction manually so that the hook's extra
    // accounts are part of the instruction's account keys (not just
    // account_infos).  Anchor's `transfer_checked` CPI wrapper only puts
    // the 4 base keys in the instruction; `with_remaining_accounts` adds
    // to account_infos but NOT to instruction keys, so Token-2022 never
    // sees the hook accounts and the CPI fails with "account missing."
    //
    // TransferChecked instruction layout (spl-token-2022):
    //   data:     [12u8, amount(8 LE), decimals(1)]
    //   accounts: [source(w), mint, dest(w), authority(s), ...hook_extras]

    let mut ix_data = Vec::with_capacity(10);
    ix_data.push(12u8); // TokenInstruction::TransferChecked
    ix_data.extend_from_slice(&amount.to_le_bytes());
    ix_data.push(ctx.accounts.mint.decimals);

    let mut ix_accounts = vec![
        AccountMeta::new(ctx.accounts.from_token_account.key(), false),
        AccountMeta::new_readonly(ctx.accounts.mint.key(), false),
        AccountMeta::new(ctx.accounts.treasury_token_account.key(), false),
        AccountMeta::new_readonly(ctx.accounts.permanent_delegate.key(), true),
    ];

    // Append the transfer-hook extra accounts from remaining_accounts
    for acc in ctx.remaining_accounts.iter() {
        if acc.is_writable {
            ix_accounts.push(AccountMeta::new(*acc.key, false));
        } else {
            ix_accounts.push(AccountMeta::new_readonly(*acc.key, false));
        }
    }

    let ix = Instruction {
        program_id: ctx.accounts.token_program.key(),
        accounts: ix_accounts,
        data: ix_data,
    };

    // Collect all AccountInfo objects for invoke_signed
    let mut infos = vec![
        ctx.accounts.from_token_account.to_account_info(),
        ctx.accounts.mint.to_account_info(),
        ctx.accounts.treasury_token_account.to_account_info(),
        ctx.accounts.permanent_delegate.to_account_info(),
    ];
    infos.extend(ctx.remaining_accounts.iter().cloned());
    infos.push(ctx.accounts.token_program.to_account_info());

    invoke_signed(&ix, &infos, signer_seeds)?;

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