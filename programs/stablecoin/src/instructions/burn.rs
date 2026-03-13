use anchor_lang::prelude::*;
use anchor_spl::token_interface::{self, Burn, TokenInterface};

use crate::instructions::auth::require_operator_role;
use crate::instructions::token_accounts::{load_mint, load_token_account};
use crate::errors::StablecoinError;
use crate::events::TokensBurned;
use crate::state::{RoleAssignment, RoleType, StablecoinConfig};

#[derive(Accounts)]
pub struct BurnTokens<'info> {
    #[account(mut)]
    pub config: Account<'info, StablecoinConfig>,
    #[account(mut)]
    pub mint: UncheckedAccount<'info>,
    #[account(mut)]
    pub from: UncheckedAccount<'info>,
    pub burner: Signer<'info>,
    pub token_program: Interface<'info, TokenInterface>,
    pub role_assignment: Option<Account<'info, RoleAssignment>>,
}

pub fn handler(ctx: Context<BurnTokens>, amount: u64) -> Result<()> {
    require!(amount > 0, StablecoinError::InvalidAmount);
    require!(!ctx.accounts.config.is_paused, StablecoinError::Paused);
    require_keys_eq!(
        ctx.accounts.config.mint,
        ctx.accounts.mint.key(),
        StablecoinError::InvalidMint
    );
    let token_program = ctx.accounts.token_program.key();
    let source = load_token_account(&ctx.accounts.from, &token_program)?;
    load_mint(&ctx.accounts.mint, &token_program)?;
    require_keys_eq!(source.mint, ctx.accounts.mint.key(), StablecoinError::InvalidMint);
    require_operator_role(
        ctx.program_id,
        &ctx.accounts.config,
        &ctx.accounts.burner.key(),
        ctx.accounts.role_assignment.as_ref(),
        RoleType::Burner,
    )?;

    token_interface::burn(
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

    let config = &mut ctx.accounts.config;
    config.total_burned = config
        .total_burned
        .checked_add(amount)
        .ok_or(StablecoinError::Overflow)?;

    emit!(TokensBurned {
        mint: ctx.accounts.mint.key(),
        source: ctx.accounts.from.key(),
        amount,
        authority: ctx.accounts.burner.key(),
    });

    Ok(())
}
