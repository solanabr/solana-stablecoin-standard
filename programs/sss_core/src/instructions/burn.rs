use anchor_lang::prelude::*;
use anchor_spl::{
    token_interface::{Mint, TokenAccount, TokenInterface},
    token_2022,
};
use crate::state::StablecoinConfig;
use crate::error::StablecoinError;
use crate::events::BurnEvent;

#[derive(Accounts)]
pub struct BurnToken<'info> {
    #[account(mut)]
    pub signer: Signer<'info>,
    #[account(seeds = [b"config"], bump = config.bump)]
    pub config: Account<'info, StablecoinConfig>,
    #[account(mut, address = config.mint)]
    pub mint: InterfaceAccount<'info, Mint>,
    #[account(mut)]
    pub token_account: InterfaceAccount<'info, TokenAccount>,
    pub token_program: Interface<'info, TokenInterface>,
}

pub fn process_burn(ctx: Context<BurnToken>, amount: u64) -> Result<()> {
    let config = &ctx.accounts.config;
    require_keys_eq!(ctx.accounts.signer.key(), config.burner_authority, StablecoinError::Unauthorized);
    
    let cpi_accounts = token_2022::Burn {
        mint: ctx.accounts.mint.to_account_info(),
        from: ctx.accounts.token_account.to_account_info(),
        authority: ctx.accounts.signer.to_account_info(),
    };
    let cpi_ctx = CpiContext::new(ctx.accounts.token_program.to_account_info(), cpi_accounts);
    token_2022::burn(cpi_ctx, amount)?;

    emit!(BurnEvent {
        from: ctx.accounts.token_account.key(),
        amount,
    });

    Ok(())
}