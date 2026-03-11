use anchor_lang::prelude::*;
use anchor_spl::{
    token_interface::{Mint, TokenAccount, TokenInterface},
    token_2022,
};
use crate::state::StablecoinConfig;
use crate::error::StablecoinError;

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

// Важно: Явный lifetime <'info>, чтобы мы могли читать remaining_accounts
pub fn process_seize<'info>(ctx: Context<'_, '_, '_, 'info, SeizeTokens<'info>>, amount: u64) -> Result<()> {
    let config = &ctx.accounts.config;
    require_keys_eq!(ctx.accounts.signer.key(), config.seizer_authority, StablecoinError::Unauthorized);
    require!(config.enable_permanent_delegate, StablecoinError::FeatureNotEnabled);

    let seeds = &[b"config".as_ref(), &[config.bump]];
    let signer = &[&seeds[..]];

    // 1. Создаем нативную инструкцию transfer_checked
    let mut transfer_ix = token_2022::spl_token_2022::instruction::transfer_checked(
        &ctx.accounts.token_program.key(),
        &ctx.accounts.frozen_account.key(),
        &ctx.accounts.mint.key(),
        &ctx.accounts.treasury_account.key(),
        &config.key(), // Авторитет (наш PDA-конфиг)
        &[],
        amount,
        ctx.accounts.mint.decimals,
    )?;

    // 2. Собираем базовые аккаунты для вызова
    let mut account_infos = vec![
        ctx.accounts.frozen_account.to_account_info(),
        ctx.accounts.mint.to_account_info(),
        ctx.accounts.treasury_account.to_account_info(),
        ctx.accounts.config.to_account_info(),
        ctx.accounts.token_program.to_account_info(),
    ];

    // 3. ДИНАМИЧЕСКИ ДОБАВЛЯЕМ ВСЕ REMAINING ACCOUNTS (Хуки, Блэклисты)
    // Они добавляются СТРОГО В КОНЕЦ (push), чтобы не сломать логику Anchor
    for acc in ctx.remaining_accounts {
        transfer_ix.accounts.push(AccountMeta {
            pubkey: acc.key(),
            is_signer: acc.is_signer,
            is_writable: acc.is_writable,
        });
        account_infos.push(acc.to_account_info());
    }

    // 4. Вызываем перевод нативно
    anchor_lang::solana_program::program::invoke_signed(
        &transfer_ix,
        &account_infos,
        signer,
    )?;

    msg!("✅ Tokens seized successfully!");
    Ok(())
}