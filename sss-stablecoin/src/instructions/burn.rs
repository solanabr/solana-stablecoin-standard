use anchor_lang::prelude::*;
use anchor_spl::token_2022::{burn, Burn as BurnCpi, Token2022};
use anchor_spl::token_interface::{Mint, TokenAccount};

use crate::errors::StablecoinError;
use crate::events::*;
use crate::state::{RoleRegistry, StablecoinConfig};

#[derive(Accounts)]
pub struct Burn<'info> {
    #[account(
        mut,
        seeds = [StablecoinConfig::SEED_PREFIX.as_bytes(), config.authority.as_ref(), config.symbol.as_bytes()],
        bump = config.bump
    )]
    pub config: Account<'info, StablecoinConfig>,
    #[account(
        seeds = [RoleRegistry::SEED_PREFIX.as_bytes(), config.key().as_ref()],
        bump = role_registry.bump
    )]
    pub role_registry: Account<'info, RoleRegistry>,
    #[account(mut, constraint = mint.key() == config.mint)]
    pub mint: InterfaceAccount<'info, Mint>,
    #[account(mut, token::mint = mint, token::authority = burner, token::token_program = token_program)]
    pub burner_ata: InterfaceAccount<'info, TokenAccount>,
    #[account(mut)]
    pub burner: Signer<'info>,
    pub token_program: Program<'info, Token2022>,
}

pub fn burn_tokens(ctx: Context<Burn>, amount: u64) -> Result<()> {
    require!(!ctx.accounts.config.paused, StablecoinError::Paused);
    require!(amount > 0, StablecoinError::ZeroAmount);

    let burner = ctx.accounts.burner.key();
    let is_burner = ctx.accounts.role_registry.master == burner
        || ctx.accounts.role_registry.burners.contains(&burner);
    require!(is_burner, StablecoinError::Unauthorized);

    let cpi_ctx = CpiContext::new(
        ctx.accounts.token_program.to_account_info(),
        BurnCpi {
            mint: ctx.accounts.mint.to_account_info(),
            from: ctx.accounts.burner_ata.to_account_info(),
            authority: ctx.accounts.burner.to_account_info(),
        },
    );
    burn(cpi_ctx, amount)?;

    let config = &mut ctx.accounts.config;
    config.total_burned = config.total_burned.saturating_add(amount);

    emit!(Burned { burner, amount });
    Ok(())
}
