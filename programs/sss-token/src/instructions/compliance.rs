use anchor_lang::prelude::*;
use anchor_lang::solana_program;
use anchor_spl::token_interface::{Mint, TokenAccount, TokenInterface};
use spl_token_2022;

use crate::{
    error::StablecoinError,
    events::{BlacklistUpdated, TokensSeized},
    state::{
        BlacklistEntry, RoleEntry, RoleType, StablecoinConfig, BLACKLIST_SEED, CONFIG_SEED,
        ROLE_SEED,
    },
};

// Maximum reason string length (must match state.rs max_len)
const MAX_REASON_LEN: usize = 128;

// ─────────────────────────────────────────────────────────────────────────────
// AddToBlacklist
// ─────────────────────────────────────────────────────────────────────────────

#[derive(Accounts)]
#[instruction(reason: String)]
pub struct AddToBlacklistCtx<'info> {
    /// Signer — must be master authority or hold Blacklister role.
    #[account(mut)]
    pub authority: Signer<'info>,

    /// Config PDA.
    #[account(
        seeds = [CONFIG_SEED, config.mint.as_ref()],
        bump = config.bump,
    )]
    pub config: Account<'info, StablecoinConfig>,

    /// The address being blacklisted.
    /// CHECK: Arbitrary wallet or program address — stored only.
    pub target: UncheckedAccount<'info>,

    /// BlacklistEntry PDA — created on first use; reactivated if previously deactivated.
    ///
    /// Seeds: [b"blacklist", mint, target]
    #[account(
        init_if_needed,
        payer = authority,
        space = 8 + BlacklistEntry::INIT_SPACE,
        seeds = [BLACKLIST_SEED, config.mint.as_ref(), target.key().as_ref()],
        bump
    )]
    pub blacklist_entry: Account<'info, BlacklistEntry>,

    /// Optional Blacklister role PDA. Required when not master authority.
    #[account(
        seeds = [
            ROLE_SEED,
            config.mint.as_ref(),
            &[RoleType::Blacklister as u8],
            authority.key().as_ref(),
        ],
        bump = blacklister_role.bump,
        constraint = blacklister_role.mint == config.mint @ StablecoinError::Unauthorized,
        constraint = blacklister_role.address == authority.key() @ StablecoinError::Unauthorized,
        constraint = blacklister_role.role == RoleType::Blacklister @ StablecoinError::Unauthorized,
    )]
    pub blacklister_role: Option<Account<'info, RoleEntry>>,

    pub system_program: Program<'info, System>,
}

pub fn add_to_blacklist_handler(
    ctx: Context<AddToBlacklistCtx>,
    reason: String,
) -> Result<()> {
    let config = &ctx.accounts.config;

    // ── SSS-2 guard ───────────────────────────────────────────────────────
    require!(
        config.enable_permanent_delegate || config.enable_transfer_hook,
        StablecoinError::Sss2NotEnabled
    );

    // ── Authorisation ─────────────────────────────────────────────────────
    let caller = ctx.accounts.authority.key();
    let is_master = caller == config.authority;

    if !is_master {
        let role = ctx
            .accounts
            .blacklister_role
            .as_ref()
            .ok_or(StablecoinError::Unauthorized)?;
        require!(role.active, StablecoinError::RoleInactive);
    }

    // ── Validate reason length ────────────────────────────────────────────
    require!(reason.len() <= MAX_REASON_LEN, StablecoinError::StringTooLong);

    // ── Write BlacklistEntry ──────────────────────────────────────────────
    let entry = &mut ctx.accounts.blacklist_entry;
    entry.address = ctx.accounts.target.key();
    entry.mint = config.mint;
    entry.reason = reason.clone();
    entry.blacklisted_at = Clock::get()?.unix_timestamp;
    entry.blacklisted_by = caller;
    entry.active = true;
    entry.bump = ctx.bumps.blacklist_entry;

    emit!(BlacklistUpdated {
        mint: config.mint,
        address: ctx.accounts.target.key(),
        blacklisted: true,
        reason,
        timestamp: entry.blacklisted_at,
    });

    Ok(())
}

// ─────────────────────────────────────────────────────────────────────────────
// RemoveFromBlacklist
// ─────────────────────────────────────────────────────────────────────────────

#[derive(Accounts)]
pub struct RemoveFromBlacklistCtx<'info> {
    /// Signer — must be master authority or hold Blacklister role.
    pub authority: Signer<'info>,

    /// Config PDA.
    #[account(
        seeds = [CONFIG_SEED, config.mint.as_ref()],
        bump = config.bump,
    )]
    pub config: Account<'info, StablecoinConfig>,

    /// The address being removed from the blacklist.
    /// CHECK: Arbitrary pubkey used only as seed reference.
    pub target: UncheckedAccount<'info>,

    /// BlacklistEntry PDA to deactivate.
    #[account(
        mut,
        seeds = [BLACKLIST_SEED, config.mint.as_ref(), target.key().as_ref()],
        bump = blacklist_entry.bump,
        constraint = blacklist_entry.mint == config.mint @ StablecoinError::Unauthorized,
        constraint = blacklist_entry.address == target.key() @ StablecoinError::Unauthorized,
    )]
    pub blacklist_entry: Account<'info, BlacklistEntry>,

    /// Optional Blacklister role PDA. Required when not master authority.
    #[account(
        seeds = [
            ROLE_SEED,
            config.mint.as_ref(),
            &[RoleType::Blacklister as u8],
            authority.key().as_ref(),
        ],
        bump = blacklister_role.bump,
        constraint = blacklister_role.mint == config.mint @ StablecoinError::Unauthorized,
        constraint = blacklister_role.address == authority.key() @ StablecoinError::Unauthorized,
        constraint = blacklister_role.role == RoleType::Blacklister @ StablecoinError::Unauthorized,
    )]
    pub blacklister_role: Option<Account<'info, RoleEntry>>,
}

pub fn remove_from_blacklist_handler(ctx: Context<RemoveFromBlacklistCtx>) -> Result<()> {
    let config = &ctx.accounts.config;

    // ── SSS-2 guard ───────────────────────────────────────────────────────
    require!(
        config.enable_permanent_delegate || config.enable_transfer_hook,
        StablecoinError::Sss2NotEnabled
    );

    // ── Authorisation ─────────────────────────────────────────────────────
    let caller = ctx.accounts.authority.key();
    let is_master = caller == config.authority;

    if !is_master {
        let role = ctx
            .accounts
            .blacklister_role
            .as_ref()
            .ok_or(StablecoinError::Unauthorized)?;
        require!(role.active, StablecoinError::RoleInactive);
    }

    // ── Require entry was active ──────────────────────────────────────────
    require!(
        ctx.accounts.blacklist_entry.active,
        StablecoinError::NotBlacklisted
    );

    // ── Deactivate ────────────────────────────────────────────────────────
    let entry = &mut ctx.accounts.blacklist_entry;
    entry.active = false;

    emit!(BlacklistUpdated {
        mint: config.mint,
        address: ctx.accounts.target.key(),
        blacklisted: false,
        reason: entry.reason.clone(),
        timestamp: Clock::get()?.unix_timestamp,
    });

    Ok(())
}

// ─────────────────────────────────────────────────────────────────────────────
// Seize — forcibly transfer tokens using the permanent delegate
// ─────────────────────────────────────────────────────────────────────────────

#[derive(Accounts)]
pub struct SeizeCtx<'info> {
    /// Signer — must be master authority or hold Seizer role.
    pub authority: Signer<'info>,

    /// Config PDA — the permanent delegate authority.
    #[account(
        seeds = [CONFIG_SEED, mint.key().as_ref()],
        bump = config.bump,
        has_one = mint,
    )]
    pub config: Account<'info, StablecoinConfig>,

    /// Token-2022 mint.
    #[account(mut)]
    pub mint: InterfaceAccount<'info, Mint>,

    /// Token account to seize FROM.
    #[account(
        mut,
        constraint = from.mint == mint.key() @ StablecoinError::Unauthorized,
    )]
    pub from: InterfaceAccount<'info, TokenAccount>,

    /// Token account to seize INTO (e.g. a compliance treasury).
    #[account(
        mut,
        constraint = to.mint == mint.key() @ StablecoinError::Unauthorized,
    )]
    pub to: InterfaceAccount<'info, TokenAccount>,

    /// Optional Seizer role PDA. Required when not master authority.
    #[account(
        seeds = [
            ROLE_SEED,
            mint.key().as_ref(),
            &[RoleType::Seizer as u8],
            authority.key().as_ref(),
        ],
        bump = seizer_role.bump,
        constraint = seizer_role.mint == mint.key() @ StablecoinError::Unauthorized,
        constraint = seizer_role.address == authority.key() @ StablecoinError::Unauthorized,
        constraint = seizer_role.role == RoleType::Seizer @ StablecoinError::Unauthorized,
    )]
    pub seizer_role: Option<Account<'info, RoleEntry>>,

    pub token_program: Interface<'info, TokenInterface>,
}

pub fn seize_handler<'info>(ctx: Context<'_, '_, '_, 'info, SeizeCtx<'info>>, amount: u64) -> Result<()> {
    let config = &ctx.accounts.config;

    // ── SSS-2 guard ───────────────────────────────────────────────────────
    require!(
        config.enable_permanent_delegate || config.enable_transfer_hook,
        StablecoinError::Sss2NotEnabled
    );

    // Seize specifically requires the permanent delegate extension.
    require!(
        config.enable_permanent_delegate,
        StablecoinError::NoPermanentDelegate
    );

    // ── Authorisation ─────────────────────────────────────────────────────
    require!(amount > 0, StablecoinError::InvalidAmount);

    let caller = ctx.accounts.authority.key();
    let is_master = caller == config.authority;

    if !is_master {
        let role = ctx
            .accounts
            .seizer_role
            .as_ref()
            .ok_or(StablecoinError::Unauthorized)?;
        require!(role.active, StablecoinError::RoleInactive);
    }

    // ── CPI: transfer_checked via config PDA (permanent delegate) ─────────
    //
    // The permanent delegate extension allows the config PDA to move tokens
    // from ANY token account associated with this mint, without requiring
    // the account owner's signature.
    //
    // When the mint has a TransferHook extension, Token-2022 will invoke the
    // hook program during TransferChecked processing.  The hook program and
    // all of its required extra accounts must be present in the CPI accounts
    // list.  Callers pass these as remaining_accounts on the outer instruction;
    // we forward them here so Token-2022 can resolve the hook.
    let mint_key = ctx.accounts.mint.key();
    let config_bump = config.bump;
    let signer_seeds: &[&[&[u8]]] = &[&[CONFIG_SEED, mint_key.as_ref(), &[config_bump]]];

    let decimals = ctx.accounts.mint.decimals;

    let mut ix = spl_token_2022::instruction::transfer_checked(
        ctx.accounts.token_program.to_account_info().key,
        ctx.accounts.from.to_account_info().key,
        ctx.accounts.mint.to_account_info().key,
        ctx.accounts.to.to_account_info().key,
        ctx.accounts.config.to_account_info().key,
        &[],
        amount,
        decimals,
    )?;

    // Append the extra accounts (transfer hook program, ExtraAccountMetaList,
    // and hook-specific PDAs) to both the instruction's account list AND the
    // account infos slice.  Token-2022 only passes to the hook the accounts
    // that appear in the instruction's account_metas; extras in the account_infos
    // slice that are absent from account_metas are silently dropped.
    for acc in ctx.remaining_accounts.iter() {
        ix.accounts.push(solana_program::instruction::AccountMeta {
            pubkey: *acc.key,
            is_signer: acc.is_signer,
            is_writable: acc.is_writable,
        });
    }

    // Build the full accounts slice: base accounts + any remaining accounts
    // (transfer hook program, ExtraAccountMetaList, hook extra accounts).
    let base_accounts = [
        ctx.accounts.from.to_account_info(),
        ctx.accounts.mint.to_account_info(),
        ctx.accounts.to.to_account_info(),
        ctx.accounts.config.to_account_info(),
    ];
    let invoke_accounts: Vec<AccountInfo> = base_accounts
        .iter()
        .cloned()
        .chain(ctx.remaining_accounts.iter().cloned())
        .collect();

    solana_program::program::invoke_signed(&ix, &invoke_accounts, signer_seeds)?;

    emit!(TokensSeized {
        mint: mint_key,
        from: ctx.accounts.from.key(),
        to: ctx.accounts.to.key(),
        amount,
        seizer: caller,
        timestamp: Clock::get()?.unix_timestamp,
    });

    Ok(())
}
