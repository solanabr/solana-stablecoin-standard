use anchor_lang::prelude::*;

use crate::{constants::*, events::BurnTokensEvent, state::RoleAccount};
use anchor_spl::{token_2022::{self, Burn, Token2022}, token_interface::TokenAccount};

#[event_cpi]
#[derive(Accounts)]
pub struct BurnTokens<'info> {
    /// The burner; must have a burner RoleAccount for this mint.
    pub burner: Signer<'info>,
    /// CHECK: Token-2022 mint. Verified by burner_role seeds.
    #[account(mut)]
    pub mint: UncheckedAccount<'info>,
    /// Source token account to burn from.
    /// CHECK: Validated by the token program during CPI.
    #[account(mut)]
    pub from: InterfaceAccount<'info, TokenAccount>,
    /// Burner role PDA. Existence confirms the role is granted.
    #[account(
        seeds = [ROLE_SEED, mint.key().as_ref(), BURNER_ROLE, burner.key().as_ref()],
        bump = burner_role.bump,
    )]
    pub burner_role: Account<'info, RoleAccount>,
    pub token_program: Program<'info, Token2022>,
}

pub fn handler(ctx: Context<BurnTokens>, amount: u64) -> Result<()> {
    let burner = ctx.accounts.burner.key();
    let mint = ctx.accounts.mint.key();
    let from = ctx.accounts.from.key();

    token_2022::burn(
        CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            Burn {
                mint: ctx.accounts.mint.to_account_info(),
                from: ctx.accounts.from.to_account_info(),
                authority: ctx.accounts.burner.to_account_info(),
            },
        ),
        amount,
    )?;

    emit_cpi!(BurnTokensEvent { burner, mint, from, amount });

    Ok(())
}
