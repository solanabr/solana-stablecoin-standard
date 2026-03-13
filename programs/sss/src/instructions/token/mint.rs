use anchor_lang::prelude::*;
use anchor_spl::token_interface::{mint_to, Mint, MintTo, Token2022, TokenAccount};
use crate::state::*;
use crate::errors::*;
use crate::events::*;

#[derive(Accounts)]
pub struct MintToken<'info> {
    #[account(mut)]
    pub minter: Signer<'info>,

    #[account(
        constraint = !config.is_paused @ StablecoinError::SystemPaused
    )]
    pub config: Account<'info, StablecoinConfig>,

    #[account(
        seeds = [b"role", config.key().as_ref(), minter.key().as_ref()],
        bump,
        constraint = role_registry.has_minter @ StablecoinError::Unauthorized
    )]
    pub role_registry: Account<'info, RoleRegistry>,

    #[account(
        mut,
        seeds = [b"quota", config.key().as_ref(), minter.key().as_ref()],
        bump,
    )]
    pub quota: Account<'info, MinterQuota>,

    #[account(mut, address = config.mint)]
    pub mint: InterfaceAccount<'info, Mint>,

    #[account(mut)]
    pub to: InterfaceAccount<'info, TokenAccount>,

    pub token_program: Program<'info, Token2022>,
}

pub fn mint_handler(ctx: Context<MintToken>, amount: u64) -> Result<()> {
    let quota = &mut ctx.accounts.quota;

    // Check quota logic
    let new_minted_amount = quota.minted_amount.checked_add(amount).ok_or(StablecoinError::MathOverflow)?;
    require!(new_minted_amount <= quota.limit, StablecoinError::QuotaExceeded);
    quota.minted_amount = new_minted_amount;

    // Execute Mint
    let seeds = &[
        b"config",
        ctx.accounts.mint.to_account_info().key.as_ref(),
        &[ctx.accounts.config.bump],
    ];
    let signer = &[&seeds[..]];

    let cpi_accounts = MintTo {
        mint: ctx.accounts.mint.to_account_info(),
        to: ctx.accounts.to.to_account_info(),
        authority: ctx.accounts.config.to_account_info(),
    };
    let cpi_program = ctx.accounts.token_program.to_account_info();
    let cpi_ctx = CpiContext::new_with_signer(cpi_program, cpi_accounts, signer);

    mint_to(cpi_ctx, amount)?;

    emit!(MintEvent {
        config: ctx.accounts.config.key(),
        minter: ctx.accounts.minter.key(),
        to: ctx.accounts.to.key(),
        amount,
    });

    Ok(())
}
