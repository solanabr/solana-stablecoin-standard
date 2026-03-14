use anchor_lang::prelude::*;
use anchor_spl::token_interface::{
    Mint, TokenAccount, TokenInterface,
    FreezeAccount, ThawAccount,
    freeze_account, thaw_account,
};

use crate::state::*;
use crate::errors::SssError;

pub fn freeze_handler(ctx: Context<FreezeTokenAccount>) -> Result<()> {
    let config = &ctx.accounts.config;
    require!(!config.is_paused, SssError::Paused);

    let roles = &ctx.accounts.roles_config;
    require!(roles.is_freezer, SssError::Unauthorized);

    let mint_key = ctx.accounts.mint.key();
    let seeds: &[&[u8]] = &[b"config", mint_key.as_ref(), &[config.bump]];

    freeze_account(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            FreezeAccount {
                account: ctx.accounts.target_account.to_account_info(),
                mint: ctx.accounts.mint.to_account_info(),
                authority: ctx.accounts.config.to_account_info(),
            },
            &[seeds],
        ),
    )?;

    msg!("Froze account {}", ctx.accounts.target_account.key());
    Ok(())
}

pub fn thaw_handler(ctx: Context<ThawTokenAccount>) -> Result<()> {
    let config = &ctx.accounts.config;

    let roles = &ctx.accounts.roles_config;
    require!(roles.is_freezer, SssError::Unauthorized);

    let mint_key = ctx.accounts.mint.key();
    let seeds: &[&[u8]] = &[b"config", mint_key.as_ref(), &[config.bump]];

    thaw_account(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            ThawAccount {
                account: ctx.accounts.target_account.to_account_info(),
                mint: ctx.accounts.mint.to_account_info(),
                authority: ctx.accounts.config.to_account_info(),
            },
            &[seeds],
        ),
    )?;

    msg!("Thawed account {}", ctx.accounts.target_account.key());
    Ok(())
}

#[derive(Accounts)]
pub struct FreezeTokenAccount<'info> {
    pub freezer: Signer<'info>,

    #[account(
        seeds = [b"config", mint.key().as_ref()],
        bump = config.bump,
    )]
    pub config: Account<'info, StablecoinConfig>,

    #[account(constraint = mint.key() == config.mint)]
    pub mint: InterfaceAccount<'info, Mint>,

    #[account(
        mut,
        token::mint = mint,
        token::token_program = token_program,
    )]
    pub target_account: InterfaceAccount<'info, TokenAccount>,

    #[account(
        seeds = [b"roles", config.key().as_ref(), freezer.key().as_ref()],
        bump = roles_config.bump,
    )]
    pub roles_config: Account<'info, RolesConfig>,

    pub token_program: Interface<'info, TokenInterface>,
}

#[derive(Accounts)]
pub struct ThawTokenAccount<'info> {
    pub freezer: Signer<'info>,

    #[account(
        seeds = [b"config", mint.key().as_ref()],
        bump = config.bump,
    )]
    pub config: Account<'info, StablecoinConfig>,

    #[account(constraint = mint.key() == config.mint)]
    pub mint: InterfaceAccount<'info, Mint>,

    #[account(
        mut,
        token::mint = mint,
        token::token_program = token_program,
    )]
    pub target_account: InterfaceAccount<'info, TokenAccount>,

    #[account(
        seeds = [b"roles", config.key().as_ref(), freezer.key().as_ref()],
        bump = roles_config.bump,
    )]
    pub roles_config: Account<'info, RolesConfig>,

    pub token_program: Interface<'info, TokenInterface>,
}
