use anchor_lang::prelude::*;
use anchor_spl::{
    token_2022::{burn, Burn, Token2022},
    token_interface::{Mint, TokenAccount},
};
use crate::{
    constants::*,
    error::SssError,
    events::TokensBurned,
    state::StablecoinConfig,
};

#[derive(Accounts)]
pub struct BurnTokens<'info> {
    /// The burner — either the designated burner role or master authority
    pub burner: Signer<'info>,

    #[account(
        seeds = [CONFIG_SEED, mint.key().as_ref()],
        bump = config.bump,
        constraint = !config.paused @ SssError::ContractPaused,
        constraint = config.has_burn_authority(&burner.key()) @ SssError::Unauthorized,
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

    /// Owner of the token_account — must sign to authorize burn from their account
    pub token_account_owner: Signer<'info>,

    pub token_program: Program<'info, Token2022>,
}

pub fn handler(ctx: Context<BurnTokens>, amount: u64) -> Result<()> {
    let mint_key = ctx.accounts.config.mint;

    burn(
        CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            Burn {
                mint: ctx.accounts.mint.to_account_info(),
                from: ctx.accounts.token_account.to_account_info(),
                authority: ctx.accounts.token_account_owner.to_account_info(),
            },
        ),
        amount,
    )?;

    emit!(TokensBurned {
        mint: mint_key,
        from: ctx.accounts.token_account.key(),
        amount,
        burner: ctx.accounts.burner.key(),
    });

    Ok(())
}
