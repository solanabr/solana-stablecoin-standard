use anchor_lang::prelude::*;
use anchor_spl::token_interface::{self, Burn, Mint, TokenAccount, TokenInterface};

use crate::state::{Role, RoleAssignment, StablecoinState};
use super::SssError;

#[derive(Accounts)]
pub struct BurnTokens<'info> {
    pub burner: Signer<'info>,

    #[account(
        seeds = [b"stablecoin", mint.key().as_ref()],
        bump = stablecoin_state.bump,
        constraint = !stablecoin_state.paused @ SssError::Paused,
    )]
    pub stablecoin_state: Account<'info, StablecoinState>,

    /// Role assignment proving the caller is an authorized burner or master authority.
    #[account(
        seeds = [b"role", stablecoin_state.key().as_ref(), Role::Burner.seed(), burner.key().as_ref()],
        bump = role_assignment.bump,
        constraint = role_assignment.active @ SssError::Unauthorized,
    )]
    pub role_assignment: Account<'info, RoleAssignment>,

    #[account(
        mut,
        constraint = mint.key() == stablecoin_state.mint,
    )]
    pub mint: InterfaceAccount<'info, Mint>,

    #[account(
        mut,
        constraint = token_account.mint == mint.key(),
    )]
    pub token_account: InterfaceAccount<'info, TokenAccount>,

    pub token_program: Interface<'info, TokenInterface>,
}

pub fn burn_handler(ctx: Context<BurnTokens>, amount: u64) -> Result<()> {
    let mint_key = ctx.accounts.mint.key();
    let seeds = &[
        b"stablecoin",
        mint_key.as_ref(),
        &[ctx.accounts.stablecoin_state.bump],
    ];
    let signer_seeds = &[&seeds[..]];

    token_interface::burn(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            Burn {
                mint: ctx.accounts.mint.to_account_info(),
                from: ctx.accounts.token_account.to_account_info(),
                authority: ctx.accounts.stablecoin_state.to_account_info(),
            },
            signer_seeds,
        ),
        amount,
    )?;

    msg!("SSS: Burned {} tokens", amount);
    Ok(())
}
