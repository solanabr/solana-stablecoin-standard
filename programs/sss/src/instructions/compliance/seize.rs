use anchor_lang::prelude::*;
use anchor_spl::token_interface::{Mint, Token2022, TokenAccount};
use anchor_spl::token_2022::spl_token_2022::instruction::transfer_checked as spl_transfer_checked;
use solana_program::program::invoke_signed;
use crate::state::*;
use crate::errors::*;
use crate::events::*;

#[derive(Accounts)]
pub struct Seize<'info> {
    #[account(mut)]
    pub seizer: Signer<'info>,

    #[account(
        constraint = config.enable_permanent_delegate == true @ StablecoinError::PermanentDelegateDisabled
    )]
    pub config: Account<'info, StablecoinConfig>,

    #[account(
        seeds = [b"role", config.key().as_ref(), seizer.key().as_ref()],
        bump,
        constraint = role_registry.has_seizer @ StablecoinError::Unauthorized
    )]
    pub role_registry: Account<'info, RoleRegistry>,

    #[account(mut, address = config.mint)]
    pub mint: InterfaceAccount<'info, Mint>,

    #[account(mut)]
    pub from: InterfaceAccount<'info, TokenAccount>,

    #[account(mut)]
    pub to: InterfaceAccount<'info, TokenAccount>,

    #[account(
        seeds = [b"blacklist", config.key().as_ref(), from.owner.as_ref()],
        bump,
        constraint = blacklist_record.account == from.owner @ StablecoinError::AccountBlacklisted
    )]
    pub blacklist_record: Account<'info, BlacklistRegistry>,

    pub token_program: Program<'info, Token2022>,
}

pub fn seize_handler(ctx: Context<Seize>, amount: u64) -> Result<()> {
    let seeds = &[
        b"config",
        ctx.accounts.mint.to_account_info().key.as_ref(),
        &[ctx.accounts.config.bump],
    ];
    let signer = &[&seeds[..]];

    let ix = spl_transfer_checked(
        ctx.accounts.token_program.key,
        ctx.accounts.from.to_account_info().key,
        ctx.accounts.mint.to_account_info().key,
        ctx.accounts.to.to_account_info().key,
        ctx.accounts.config.to_account_info().key, // The permanent delegate is the config PDA
        &[],
        amount,
        ctx.accounts.mint.decimals,
    )?;

    invoke_signed(
        &ix,
        &[
            ctx.accounts.from.to_account_info(),
            ctx.accounts.mint.to_account_info(),
            ctx.accounts.to.to_account_info(),
            ctx.accounts.config.to_account_info(),
        ],
        signer,
    )?;

    emit!(SeizeEvent {
        config: ctx.accounts.config.key(),
        from: ctx.accounts.from.key(),
        to: ctx.accounts.to.key(),
        amount,
        by: ctx.accounts.seizer.key(),
    });

    Ok(())
}
