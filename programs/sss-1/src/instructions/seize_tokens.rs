use anchor_lang::prelude::*;
use anchor_spl::{
    token_2022::Token2022,
    token_interface::{Mint, TokenAccount},
};

use crate::{
    constants::CONFIG_SEED, error::StablecoinError, events::TokensSeized, state::StablecoinConfig,
};

#[derive(Accounts)]
pub struct SeizeTokens<'info> {
    pub admin: Signer<'info>,

    #[account(
        seeds = [CONFIG_SEED, config.mint.as_ref()],
        bump = config.bump,
        constraint = config.admin == admin.key() @ StablecoinError::Unauthorized,
    )]
    pub config: Account<'info, StablecoinConfig>,

    #[account(
        mut,
        constraint = mint.key() == config.mint @ StablecoinError::Unauthorized,
    )]
    pub mint: InterfaceAccount<'info, Mint>,

    #[account(
        mut,
        token::mint = mint,
    )]
    pub from: InterfaceAccount<'info, TokenAccount>,

    #[account(
        mut,
        token::mint = mint,
    )]
    pub to: InterfaceAccount<'info, TokenAccount>,

    pub token_program: Program<'info, Token2022>,
}

pub fn handler(ctx: Context<SeizeTokens>, amount: u64) -> Result<()> {
    require!(amount > 0, StablecoinError::ZeroAmount);

    let mint_key = ctx.accounts.config.mint;
    let config_bump = ctx.accounts.config.bump;
    let config_bump_bytes = [config_bump];
    let signer_seeds: &[&[u8]] = &[CONFIG_SEED, mint_key.as_ref(), &config_bump_bytes];

    anchor_spl::token_2022::transfer_checked(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            anchor_spl::token_2022::TransferChecked {
                from: ctx.accounts.from.to_account_info(),
                mint: ctx.accounts.mint.to_account_info(),
                to: ctx.accounts.to.to_account_info(),
                authority: ctx.accounts.config.to_account_info(),
            },
            &[signer_seeds],
        ),
        amount,
        ctx.accounts.config.decimals,
    )?;

    emit!(TokensSeized {
        config: ctx.accounts.config.key(),
        admin: ctx.accounts.admin.key(),
        from: ctx.accounts.from.key(),
        to: ctx.accounts.to.key(),
        amount,
    });

    Ok(())
}
