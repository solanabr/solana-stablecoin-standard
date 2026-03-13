use anchor_lang::prelude::*;
use anchor_spl::token_interface::{self, MintTo, TokenInterface};

use crate::instructions::auth::{config_signer_seeds, require_operator_role};
use crate::instructions::token_accounts::{load_mint, load_token_account};
use crate::errors::StablecoinError;
use crate::events::TokensMinted;
use crate::state::{RoleAssignment, RoleType, StablecoinConfig};

#[derive(Accounts)]
pub struct MintTokens<'info> {
    #[account(mut)]
    pub config: Account<'info, StablecoinConfig>,
    #[account(mut)]
    pub mint: UncheckedAccount<'info>,
    #[account(mut)]
    pub destination: UncheckedAccount<'info>,
    pub minter: Signer<'info>,
    pub token_program: Interface<'info, TokenInterface>,
    #[account(mut)]
    pub role_assignment: Option<Account<'info, RoleAssignment>>,
}

pub fn handler(ctx: Context<MintTokens>, amount: u64) -> Result<()> {
    require!(amount > 0, StablecoinError::InvalidAmount);
    require!(!ctx.accounts.config.is_paused, StablecoinError::Paused);
    require_keys_eq!(
        ctx.accounts.config.mint,
        ctx.accounts.mint.key(),
        StablecoinError::InvalidMint
    );
    let token_program = ctx.accounts.token_program.key();
    let destination = load_token_account(&ctx.accounts.destination, &token_program)?;
    load_mint(&ctx.accounts.mint, &token_program)?;
    require_keys_eq!(destination.mint, ctx.accounts.mint.key(), StablecoinError::InvalidMint);
    require_operator_role(
        ctx.program_id,
        &ctx.accounts.config,
        &ctx.accounts.minter.key(),
        ctx.accounts.role_assignment.as_ref(),
        RoleType::Minter,
    )?;

    if let Some(role) = ctx.accounts.role_assignment.as_mut() {
        if ctx.accounts.minter.key() != ctx.accounts.config.authority {
            require!(role.check_mint_quota(amount), StablecoinError::QuotaExceeded);
            role.minted_so_far = role
                .minted_so_far
                .checked_add(amount)
                .ok_or(StablecoinError::Overflow)?;
        }
    }

    ctx.accounts.config.total_minted = ctx
        .accounts
        .config
        .total_minted
        .checked_add(amount)
        .ok_or(StablecoinError::Overflow)?;

    let signer_seeds =
        config_signer_seeds(&ctx.accounts.config.mint, &ctx.accounts.config.bump);
    token_interface::mint_to(
        CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            MintTo {
                mint: ctx.accounts.mint.to_account_info(),
                to: ctx.accounts.destination.to_account_info(),
                authority: ctx.accounts.config.to_account_info(),
            },
        )
        .with_signer(&[&signer_seeds]),
        amount,
    )?;

    emit!(TokensMinted {
        mint: ctx.accounts.mint.key(),
        destination: ctx.accounts.destination.key(),
        amount,
        authority: ctx.accounts.minter.key(),
    });

    Ok(())
}
