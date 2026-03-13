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
    pub signer: Signer<'info>, // Человек, который вызывает сжигание

    #[account(seeds = [b"config"], bump = config.bump)]
    pub config: Account<'info, StablecoinConfig>, // Наш PDA

    #[account(mut, address = config.mint)]
    pub mint: InterfaceAccount<'info, Mint>, // Токен, который мы сжигаем

    #[account(mut)]
    pub token_account: InterfaceAccount<'info, TokenAccount>, // Аккаунт, с которого сжигаем

    pub token_program: Interface<'info, TokenInterface>,
}

pub fn process_burn(ctx: Context<BurnToken>, amount: u64) -> Result<()> {
    let config = &ctx.accounts.config;
    
    // Проверка 1: Контракт не должен быть на паузе
    require!(!config.is_paused, StablecoinError::ContractPaused);
    
    // Проверка 2: Подписывающий должен иметь роль Burner
    require_keys_eq!(
        ctx.accounts.signer.key(),
        config.burner_authority,
        StablecoinError::Unauthorized
    );

    // Подготовка к CPI (Cross-Program Invocation)
    let cpi_accounts = token_2022::Burn {
        mint: ctx.accounts.mint.to_account_info(),
        from: ctx.accounts.token_account.to_account_info(),
        authority: ctx.accounts.signer.to_account_info(),
    };
    
    let cpi_program = ctx.accounts.token_program.to_account_info();
    let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);
    
    // Вызов инструкции сжигания из Token-2022
    token_2022::burn(cpi_ctx, amount)?;

    // Эмитим событие (для аудита)
    emit!(BurnEvent {
        from: ctx.accounts.token_account.key(),
        amount,
    });

    msg!("🔥 Burned {} tokens successfully!", amount);
    Ok(())
}