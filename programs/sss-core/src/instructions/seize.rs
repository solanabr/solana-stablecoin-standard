use anchor_lang::prelude::*;
use anchor_spl::token_interface::{self, Mint, TokenAccount, TokenInterface, TransferChecked};

use crate::constants::*;
use crate::error::SssError;
use crate::events::TokensSeized;
use crate::state::{Role, RoleAccount, StablecoinConfig};

#[derive(Accounts)]
pub struct Seize<'info> {
    pub admin: Signer<'info>,

    /// NO pause check — seizure works during emergencies.
    #[account(
        seeds = [SSS_CONFIG_SEED, mint.key().as_ref()],
        bump = config.bump,
    )]
    pub config: Account<'info, StablecoinConfig>,

    #[account(
        seeds = [
            SSS_ROLE_SEED,
            config.key().as_ref(),
            admin.key().as_ref(),
            &[Role::Admin.as_u8()],
        ],
        bump = admin_role.bump,
    )]
    pub admin_role: Account<'info, RoleAccount>,

    #[account(
        constraint = config.mint == mint.key() @ SssError::MintMismatch,
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

    pub token_program: Interface<'info, TokenInterface>,
}

pub fn handler_seize(ctx: Context<Seize>, amount: u64) -> Result<()> {
    require!(amount > 0, SssError::ZeroAmount);

    let mint_key = ctx.accounts.mint.key();
    let decimals = ctx.accounts.mint.decimals;
    let signer_seeds: &[&[&[u8]]] = &[&[
        SSS_CONFIG_SEED,
        mint_key.as_ref(),
        &[ctx.accounts.config.bump],
    ]];

    let cpi_accounts = TransferChecked {
        from: ctx.accounts.from.to_account_info(),
        mint: ctx.accounts.mint.to_account_info(),
        to: ctx.accounts.to.to_account_info(),
        authority: ctx.accounts.config.to_account_info(),
    };
    let cpi_ctx = CpiContext::new(ctx.accounts.token_program.to_account_info(), cpi_accounts)
        .with_signer(signer_seeds);

    token_interface::transfer_checked(cpi_ctx, amount, decimals)?;

    emit!(TokensSeized {
        mint: ctx.accounts.mint.key(),
        from: ctx.accounts.from.key(),
        to: ctx.accounts.to.key(),
        amount,
        seizer: ctx.accounts.admin.key(),
    });

    Ok(())
}
