use anchor_lang::prelude::*;
use anchor_spl::token_interface::{self, Mint, MintTo, TokenAccount, TokenInterface};

use crate::{
    error::StablecoinError,
    events::TokensMinted,
    state::{MinterRole, StablecoinConfig, CONFIG_SEED},
};

#[derive(Accounts)]
pub struct MintToCtx<'info> {
    /// The signer performing the mint — must be master authority or an
    /// active minter registered via `add_minter`.
    pub authority: Signer<'info>,

    /// Config PDA — provides paused flag and authority reference.
    #[account(
        mut,
        seeds = [CONFIG_SEED, mint.key().as_ref()],
        bump = config.bump,
        has_one = mint,
    )]
    pub config: Account<'info, StablecoinConfig>,

    /// Token-2022 mint to issue tokens from.
    #[account(mut)]
    pub mint: InterfaceAccount<'info, Mint>,

    /// Optional minter role PDA. If the caller is the master authority this
    /// account is ignored; otherwise it is required and validated.
    #[account(
        mut,
        seeds = [
            crate::state::MINTER_SEED,
            mint.key().as_ref(),
            authority.key().as_ref(),
        ],
        bump = minter_role.bump,
        constraint = minter_role.mint == mint.key() @ StablecoinError::Unauthorized,
        constraint = minter_role.minter == authority.key() @ StablecoinError::Unauthorized,
    )]
    pub minter_role: Option<Account<'info, MinterRole>>,

    /// Destination token account that will receive the minted tokens.
    #[account(
        mut,
        constraint = destination.mint == mint.key() @ StablecoinError::Unauthorized,
    )]
    pub destination: InterfaceAccount<'info, TokenAccount>,

    pub token_program: Interface<'info, TokenInterface>,
}

pub fn handler(ctx: Context<MintToCtx>, amount: u64) -> Result<()> {
    let config = &ctx.accounts.config;

    // ── Guards ────────────────────────────────────────────────────────────
    require!(!config.paused, StablecoinError::ProgramPaused);
    require!(amount > 0, StablecoinError::InvalidAmount);

    let caller = ctx.accounts.authority.key();
    let is_master = caller == config.authority;

    // Determine authorisation path
    if is_master {
        // Master authority bypasses minter role — no quota check needed.
    } else {
        // Must have an active minter role entry.
        let minter_role = ctx
            .accounts
            .minter_role
            .as_ref()
            .ok_or(StablecoinError::Unauthorized)?;

        require!(minter_role.active, StablecoinError::MinterInactive);

        // Enforce quota when non-zero.
        if minter_role.quota > 0 {
            let new_minted = minter_role
                .minted
                .checked_add(amount)
                .ok_or(StablecoinError::MathOverflow)?;
            require!(new_minted <= minter_role.quota, StablecoinError::QuotaExceeded);
        }
    }

    // ── CPI: mint_to via config PDA signer seeds ──────────────────────────
    let mint_key = ctx.accounts.mint.key();
    let config_bump = config.bump;
    let signer_seeds: &[&[&[u8]]] = &[&[CONFIG_SEED, mint_key.as_ref(), &[config_bump]]];

    token_interface::mint_to(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            MintTo {
                mint: ctx.accounts.mint.to_account_info(),
                to: ctx.accounts.destination.to_account_info(),
                authority: ctx.accounts.config.to_account_info(),
            },
            signer_seeds,
        ),
        amount,
    )?;

    // ── Update minter tracking ────────────────────────────────────────────
    if !is_master {
        if let Some(minter_role) = ctx.accounts.minter_role.as_mut() {
            minter_role.minted = minter_role
                .minted
                .checked_add(amount)
                .ok_or(StablecoinError::MathOverflow)?;
        }
    }

    // ── Emit event ────────────────────────────────────────────────────────
    emit!(TokensMinted {
        mint: mint_key,
        recipient: ctx.accounts.destination.key(),
        amount,
        minter: caller,
        timestamp: Clock::get()?.unix_timestamp,
    });

    Ok(())
}
