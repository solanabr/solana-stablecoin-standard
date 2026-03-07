use anchor_lang::prelude::*;

use crate::{
    constants::*,
    error::StableError,
    events::SeizeEvent,
    state::{RoleAccount, StablecoinConfig},
};
use anchor_spl::{
    token_2022::{self, Token2022, TransferChecked},
    token_interface::{Mint, TokenAccount},
};

#[event_cpi]
#[derive(Accounts)]
pub struct Seize<'info> {
    #[account(mut)]
    pub seizer: Signer<'info>,
    /// CHECK: Seizer authority PDA (seeds [SEIZER_SEED, mint]). Used as SPL permanent delegate; no account data.
    #[account(
        seeds = [SEIZER_SEED, mint.key().as_ref()],
        bump,
    )]
    pub seizer_authority: UncheckedAccount<'info>,
    #[account(
        seeds = [ROLE_SEED, mint.key().as_ref(), SEIZER_ROLE, seizer.key().as_ref()],
        bump = seizer_role.bump,
    )]
    pub seizer_role: Account<'info, RoleAccount>,
    #[account(
        seeds = [CONFIG_SEED, mint.key().as_ref()],
        bump = stablecoin_config.bump,
    )]
    pub stablecoin_config: Account<'info, StablecoinConfig>,
    /// Source token account to seize from (owner need not sign; permanent delegate authorizes).
    #[account(
        mut,
        constraint = from.mint == mint.key() @ crate::error::StableError::Unauthorized,
    )]
    pub from: InterfaceAccount<'info, TokenAccount>,
    /// Destination token account to send seized tokens to.
    #[account(
        mut,
        constraint = to.mint == mint.key() @ crate::error::StableError::Unauthorized,
    )]
    pub to: InterfaceAccount<'info, TokenAccount>,
    pub mint: InterfaceAccount<'info, Mint>,
    pub token_program: Program<'info, Token2022>,
}

pub fn handler(ctx: Context<Seize>, amount: u64) -> Result<()> {
    let config = &ctx.accounts.stablecoin_config;

    config.assert_sss2()?;
    config.assert_permanent_delegate_enabled()?;

    require!(amount > 0, StableError::InvalidAmount);

    let mint_key = ctx.accounts.mint.key();
    let seizer_seeds: &[&[u8]] = &[
        SEIZER_SEED,
        mint_key.as_ref(),
        &[ctx.bumps.seizer_authority],
    ];
    let signer_seeds = &[&seizer_seeds[..]];

    let decimals = ctx.accounts.stablecoin_config.decimals;
    token_2022::transfer_checked(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            TransferChecked {
                from: ctx.accounts.from.to_account_info(),
                mint: ctx.accounts.mint.to_account_info(),
                to: ctx.accounts.to.to_account_info(),
                authority: ctx.accounts.seizer_authority.to_account_info(),
            },
            signer_seeds,
        ),
        amount,
        decimals,
    )?;

    emit_cpi!(SeizeEvent {
        seizer: ctx.accounts.seizer.key(),
        from: ctx.accounts.from.key(),
        to: ctx.accounts.to.key(),
        mint: mint_key,
    });

    msg!("Seized {} tokens", amount);
    Ok(())
}
