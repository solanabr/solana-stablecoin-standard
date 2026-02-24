use anchor_lang::prelude::*;
use anchor_spl::token_interface::{
    self, Mint, ThawAccount as ThawAccountCpi, TokenAccount, TokenInterface,
};

use crate::constants::*;
use crate::error::SssError;
use crate::events::AccountThawed;
use crate::state::{Role, RoleAccount, StablecoinConfig};

#[derive(Accounts)]
pub struct ThawTokenAccount<'info> {
    pub freezer: Signer<'info>,

    #[account(
        seeds = [SSS_CONFIG_SEED, mint.key().as_ref()],
        bump = config.bump,
        constraint = !config.paused @ SssError::Paused,
    )]
    pub config: Account<'info, StablecoinConfig>,

    #[account(
        seeds = [
            SSS_ROLE_SEED,
            config.key().as_ref(),
            freezer.key().as_ref(),
            &[Role::Freezer.as_u8()],
        ],
        bump = freezer_role.bump,
    )]
    pub freezer_role: Account<'info, RoleAccount>,

    #[account(
        constraint = config.mint == mint.key() @ SssError::MintMismatch,
    )]
    pub mint: InterfaceAccount<'info, Mint>,

    #[account(
        mut,
        token::mint = mint,
    )]
    pub token_account: InterfaceAccount<'info, TokenAccount>,

    pub token_program: Interface<'info, TokenInterface>,
}

pub fn handler_thaw_account(ctx: Context<ThawTokenAccount>) -> Result<()> {
    let mint_key = ctx.accounts.mint.key();
    let signer_seeds: &[&[&[u8]]] = &[&[
        SSS_CONFIG_SEED,
        mint_key.as_ref(),
        &[ctx.accounts.config.bump],
    ]];

    let cpi_accounts = ThawAccountCpi {
        account: ctx.accounts.token_account.to_account_info(),
        mint: ctx.accounts.mint.to_account_info(),
        authority: ctx.accounts.config.to_account_info(),
    };
    let cpi_ctx = CpiContext::new(ctx.accounts.token_program.to_account_info(), cpi_accounts)
        .with_signer(signer_seeds);

    token_interface::thaw_account(cpi_ctx)?;

    emit!(AccountThawed {
        mint: ctx.accounts.mint.key(),
        account: ctx.accounts.token_account.key(),
        freezer: ctx.accounts.freezer.key(),
    });

    Ok(())
}
