use anchor_lang::prelude::*;
use anchor_spl::{
    token_2022::Token2022,
    token_interface::{burn as spl_burn, Burn, Mint, TokenAccount},
};

use crate::{
    errors::SssError,
    events::TokensBurned,
    state::StablecoinState,
};

#[derive(Accounts)]
pub struct BurnCtx<'info> {
    /// Must be burner, or token account owner burning their own tokens
    pub authority: Signer<'info>,

    #[account(
        mut,
        seeds = [b"stablecoin", mint.key().as_ref()],
        bump = state.bump,
    )]
    pub state: Account<'info, StablecoinState>,

    #[account(
        mut,
        constraint = mint.key() == state.mint @ SssError::Unauthorized,
    )]
    pub mint: InterfaceAccount<'info, Mint>,

    #[account(
        mut,
        token::mint = mint,
        token::token_program = token_program,
    )]
    pub from_token_account: InterfaceAccount<'info, TokenAccount>,

    /// CHECK: Permanent delegate PDA used for role-based burns when caller is
    /// not the token-account owner.
    #[account(
        seeds = [b"permanent_delegate", state.key().as_ref()],
        bump,
    )]
    pub permanent_delegate: UncheckedAccount<'info>,

    pub token_program: Program<'info, Token2022>,
}

pub fn handler(ctx: Context<BurnCtx>, amount: u64) -> Result<()> {
    require!(!ctx.accounts.state.paused, SssError::ProtocolPaused);
    require!(amount > 0, SssError::ZeroAmount);

    let authority_key = ctx.accounts.authority.key();
    let state = &ctx.accounts.state;

    let is_owner = authority_key == ctx.accounts.from_token_account.owner;
    let is_role_burner = state.burner.map_or(false, |b| b == authority_key);

    let is_authorized = is_owner || is_role_burner;

    require!(is_authorized, SssError::Unauthorized);

    if is_owner {
        spl_burn(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                Burn {
                    mint: ctx.accounts.mint.to_account_info(),
                    from: ctx.accounts.from_token_account.to_account_info(),
                    authority: ctx.accounts.authority.to_account_info(),
                },
            ),
            amount,
        )?;
    } else {
        require!(state.permanent_delegate_enabled, SssError::PermanentDelegateNotEnabled);

        let state_key = ctx.accounts.state.key();
        let delegate_seeds = &[
            b"permanent_delegate",
            state_key.as_ref(),
            &[ctx.bumps.permanent_delegate],
        ];

        spl_burn(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                Burn {
                    mint: ctx.accounts.mint.to_account_info(),
                    from: ctx.accounts.from_token_account.to_account_info(),
                    authority: ctx.accounts.permanent_delegate.to_account_info(),
                },
                &[delegate_seeds],
            ),
            amount,
        )?;
    }

    let state = &mut ctx.accounts.state;
    state.total_burned = state.total_burned.checked_add(amount).ok_or(SssError::Overflow)?;

    let total_supply = state.total_minted.saturating_sub(state.total_burned);

    emit!(TokensBurned {
        mint: ctx.accounts.mint.key(),
        from: ctx.accounts.from_token_account.key(),
        amount,
        burner: authority_key,
        total_supply,
        timestamp: Clock::get()?.unix_timestamp,
    });

    Ok(())
}