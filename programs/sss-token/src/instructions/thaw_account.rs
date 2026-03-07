use anchor_lang::prelude::*;
use anchor_spl::{
    token_2022::{thaw_account, ThawAccount, Token2022},
    token_interface::{Mint, TokenAccount},
};
use crate::{
    constants::*,
    error::SssError,
    events::AccountThawed,
    state::StablecoinConfig,
};

#[derive(Accounts)]
pub struct ThawTokenAccount<'info> {
    pub authority: Signer<'info>,

    #[account(
        seeds = [CONFIG_SEED, mint.key().as_ref()],
        bump = config.bump,
        constraint = config.authority == authority.key() @ SssError::Unauthorized,
    )]
    pub config: Account<'info, StablecoinConfig>,

    #[account(
        mut,
        address = config.mint,
    )]
    pub mint: InterfaceAccount<'info, Mint>,

    #[account(
        mut,
        token::mint = mint,
        token::token_program = token_program,
    )]
    pub token_account: InterfaceAccount<'info, TokenAccount>,

    pub token_program: Program<'info, Token2022>,
}

pub fn handler(ctx: Context<ThawTokenAccount>) -> Result<()> {
    let mint_key = ctx.accounts.config.mint;
    let config_bump = ctx.accounts.config.bump;

    thaw_account(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            ThawAccount {
                account: ctx.accounts.token_account.to_account_info(),
                mint: ctx.accounts.mint.to_account_info(),
                authority: ctx.accounts.config.to_account_info(),
            },
            &[&[CONFIG_SEED, mint_key.as_ref(), &[config_bump]]],
        ),
    )?;

    emit!(AccountThawed {
        mint: mint_key,
        token_account: ctx.accounts.token_account.key(),
        by: ctx.accounts.authority.key(),
    });

    Ok(())
}
