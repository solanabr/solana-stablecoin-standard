use anchor_lang::prelude::*;
use anchor_spl::token_interface::{self, BurnChecked, Mint, TokenAccount, TokenInterface};

use crate::{
    error::StablecoinError,
    events::TokensBurned,
    state::{RoleEntry, RoleType, StablecoinConfig, CONFIG_SEED, ROLE_SEED},
};

#[derive(Accounts)]
pub struct BurnCtx<'info> {
    /// Signer performing the burn — must be master authority or hold Burner role.
    pub authority: Signer<'info>,

    /// Config PDA — provides paused flag and authority reference.
    #[account(
        seeds = [CONFIG_SEED, mint.key().as_ref()],
        bump = config.bump,
        has_one = mint,
    )]
    pub config: Account<'info, StablecoinConfig>,

    /// Token-2022 mint whose supply will be reduced.
    #[account(mut)]
    pub mint: InterfaceAccount<'info, Mint>,

    /// Token account to burn from.
    ///
    /// When the permanent delegate is enabled the config PDA acts as authority
    /// and can burn from any account for this mint.  When it is not enabled
    /// the `authority` signer must be the token account's delegate or owner.
    #[account(
        mut,
        constraint = from.mint == mint.key() @ StablecoinError::Unauthorized,
    )]
    pub from: InterfaceAccount<'info, TokenAccount>,

    /// Optional Burner role PDA. Required when the caller is not master authority.
    #[account(
        seeds = [
            ROLE_SEED,
            mint.key().as_ref(),
            &[RoleType::Burner as u8],
            authority.key().as_ref(),
        ],
        bump = burner_role.bump,
        constraint = burner_role.mint == mint.key() @ StablecoinError::Unauthorized,
        constraint = burner_role.address == authority.key() @ StablecoinError::Unauthorized,
        constraint = burner_role.role == RoleType::Burner @ StablecoinError::Unauthorized,
    )]
    pub burner_role: Option<Account<'info, RoleEntry>>,

    pub token_program: Interface<'info, TokenInterface>,
}

pub fn handler(ctx: Context<BurnCtx>, amount: u64) -> Result<()> {
    let config = &ctx.accounts.config;

    // ── Guards ────────────────────────────────────────────────────────────
    require!(!config.paused, StablecoinError::ProgramPaused);
    require!(amount > 0, StablecoinError::InvalidAmount);

    let caller = ctx.accounts.authority.key();
    let is_master = caller == config.authority;

    if !is_master {
        let role = ctx
            .accounts
            .burner_role
            .as_ref()
            .ok_or(StablecoinError::Unauthorized)?;
        require!(role.active, StablecoinError::RoleInactive);
    }

    // ── CPI: burn_checked ─────────────────────────────────────────────────
    //
    // If the permanent delegate extension is enabled the config PDA can act
    // as authority on any token account for this mint — burner role holders
    // do not need to own the target account.
    //
    // If permanent delegate is NOT enabled the caller must own the account
    // (normal Token-2022 burn semantics).
    let decimals = ctx.accounts.mint.decimals;
    let mint_key = ctx.accounts.mint.key();
    let config_bump = config.bump;

    if config.enable_permanent_delegate {
        let signer_seeds: &[&[&[u8]]] = &[&[CONFIG_SEED, mint_key.as_ref(), &[config_bump]]];

        token_interface::burn_checked(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                BurnChecked {
                    mint: ctx.accounts.mint.to_account_info(),
                    from: ctx.accounts.from.to_account_info(),
                    authority: ctx.accounts.config.to_account_info(),
                },
                signer_seeds,
            ),
            amount,
            decimals,
        )?;
    } else {
        // Without permanent delegate the caller must own/delegate the account.
        token_interface::burn_checked(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                BurnChecked {
                    mint: ctx.accounts.mint.to_account_info(),
                    from: ctx.accounts.from.to_account_info(),
                    authority: ctx.accounts.authority.to_account_info(),
                },
            ),
            amount,
            decimals,
        )?;
    }

    // ── Emit event ────────────────────────────────────────────────────────
    emit!(TokensBurned {
        mint: mint_key,
        from: ctx.accounts.from.key(),
        amount,
        timestamp: Clock::get()?.unix_timestamp,
    });

    Ok(())
}
