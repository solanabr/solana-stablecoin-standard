use anchor_lang::prelude::*;
use anchor_spl::token_interface::{burn, Burn, Mint, Token2022, TokenAccount};
use crate::state::*;
use crate::errors::*;
use crate::events::*;

#[derive(Accounts)]
pub struct BurnToken<'info> {
    #[account(mut)]
    pub burner: Signer<'info>,

    #[account(
        constraint = !config.is_paused @ StablecoinError::SystemPaused
    )]
    pub config: Account<'info, StablecoinConfig>,

    #[account(
        seeds = [b"role", config.key().as_ref(), burner.key().as_ref()],
        bump,
        constraint = role_registry.has_burner @ StablecoinError::Unauthorized
    )]
    pub role_registry: Account<'info, RoleRegistry>,

    #[account(mut, address = config.mint)]
    pub mint: InterfaceAccount<'info, Mint>,

    #[account(mut)]
    pub from: InterfaceAccount<'info, TokenAccount>,

    pub token_program: Program<'info, Token2022>,
}

pub fn burn_handler(ctx: Context<BurnToken>, amount: u64) -> Result<()> {
    let cpi_accounts = Burn {
        mint: ctx.accounts.mint.to_account_info(),
        from: ctx.accounts.from.to_account_info(),
        authority: ctx.accounts.burner.to_account_info(),
    };
    let cpi_program = ctx.accounts.token_program.to_account_info();
    let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);

    burn(cpi_ctx, amount)?;

    emit!(BurnEvent {
        config: ctx.accounts.config.key(),
        burner: ctx.accounts.burner.key(),
        from: ctx.accounts.from.key(),
        amount,
    });

    Ok(())
}
