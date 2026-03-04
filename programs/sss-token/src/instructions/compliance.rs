use anchor_lang::prelude::*;
use anchor_spl::token_interface::{self, Mint, TokenAccount, TokenInterface, TransferChecked};

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

    /// BlacklistEntry PDA — created here.
    ///
    /// Seeds: [b"blacklist", mint, target]
    #[account(
        init,
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

pub fn seize_handler(ctx: Context<SeizeCtx>, amount: u64) -> Result<()> {
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
    let mint_key = ctx.accounts.mint.key();
    let config_bump = config.bump;
    let signer_seeds: &[&[&[u8]]] = &[&[CONFIG_SEED, mint_key.as_ref(), &[config_bump]]];

    let decimals = ctx.accounts.mint.decimals;

    token_interface::transfer_checked(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            TransferChecked {
                from: ctx.accounts.from.to_account_info(),
                mint: ctx.accounts.mint.to_account_info(),
                to: ctx.accounts.to.to_account_info(),
                authority: ctx.accounts.config.to_account_info(),
            },
            signer_seeds,
        ),
        amount,
        decimals,
    )?;

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
