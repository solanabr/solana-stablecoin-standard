use anchor_lang::prelude::*;
use anchor_spl::{
    token_interface::{Mint, TokenAccount, TokenInterface},
    token_2022::{self, TransferChecked},
};
use crate::state::StablecoinConfig;
use crate::error::StablecoinError;
use crate::events::SeizedEvent;

#[derive(Accounts)]
pub struct SeizeTokens<'info> {
    #[account(mut)]
    pub signer: Signer<'info>, 
    #[account(seeds = [b"config"], bump = config.bump)]
    pub config: Account<'info, StablecoinConfig>,
    #[account(mut, address = config.mint)]
    pub mint: InterfaceAccount<'info, Mint>,
    #[account(mut)]
    pub frozen_account: InterfaceAccount<'info, TokenAccount>,
    #[account(mut)]
    pub treasury_account: InterfaceAccount<'info, TokenAccount>, 
    pub token_program: Interface<'info, TokenInterface>,
}

pub fn process_seize(ctx: Context<SeizeTokens>, amount: u64) -> Result<()> {
    let config = &ctx.accounts.config;
    require_keys_eq!(ctx.accounts.signer.key(), config.seizer_authority, StablecoinError::Unauthorized);
    require!(config.enable_permanent_delegate, StablecoinError::FeatureNotEnabled);

    let seeds = &[b"config".as_ref(), &[config.bump]];
    let signer = &[&seeds[..]];

    let cpi_accounts = TransferChecked {
        from: ctx.accounts.frozen_account.to_account_info(),
        mint: ctx.accounts.mint.to_account_info(),
        to: ctx.accounts.treasury_account.to_account_info(),
        authority: config.to_account_info(),
    };
    
    let cpi_program = ctx.accounts.token_program.to_account_info();
    let cpi_ctx = CpiContext::new_with_signer(cpi_program, cpi_accounts, signer);
    token_2022::transfer_checked(cpi_ctx, amount, ctx.accounts.mint.decimals)?;

    emit!(SeizedEvent {
        from: ctx.accounts.frozen_account.key(),
        amount,
    });

    Ok(())
}