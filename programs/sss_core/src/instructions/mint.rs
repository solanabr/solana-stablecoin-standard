use anchor_lang::prelude::*;
use anchor_spl::{
    token_interface::{Mint, TokenAccount, TokenInterface},
    token_2022,
};
use crate::state::StablecoinConfig;
use crate::error::StablecoinError;
use crate::events::MintEvent;
use crate::state::MockOracle;

#[derive(Accounts)]
pub struct MintToken<'info> {
    #[account(mut)]
    pub signer: Signer<'info>,
    
    #[account(seeds = [b"config"], bump = config.bump)]
    pub config: Account<'info, StablecoinConfig>,
    
    #[account(mut, address = config.mint)]
    pub mint: InterfaceAccount<'info, Mint>,
    
    #[account(mut)]
    pub token_account: InterfaceAccount<'info, TokenAccount>,
    
    // ВАЖНО: Используем Option<Account<'info, MockOracle>>, 
    // Anchor сам спарсит данные, если аккаунт передан!
    pub oracle_feed_account: Option<Account<'info, MockOracle>>,
    
    pub token_program: Interface<'info, TokenInterface>,
}

// Убрали <'a>, оставляем стандартный Context
pub fn process_mint(ctx: Context<MintToken>, mut amount: u64) -> Result<()> {
    let config = &ctx.accounts.config;
    require_keys_eq!(ctx.accounts.signer.key(), config.minter_authority, StablecoinError::Unauthorized);

    // --- ИНТЕГРАЦИЯ ОРАКУЛА ---
    if let Some(feed_pubkey) = config.oracle_feed {
        msg!("🔮 Oracle Peg enabled! Adjusting mint amount...");

        // Получаем уже распарсенный аккаунт из контекста
        let feed_account = ctx.accounts.oracle_feed_account.as_ref()
            .ok_or(ProgramError::NotEnoughAccountKeys)?;

        // Проверяем, что передан именно тот оракул, который указан в конфиге
        require_keys_eq!(feed_account.key(), feed_pubkey, StablecoinError::Unauthorized);

        // Так как это уже Account<'info, MockOracle>, мы можем сразу читать поля!
        let price = feed_account.price;
        let oracle_decimals = feed_account.decimals;

        // Если принесли 1000 USD, а курс 1.10 EUR/USD (цена = 1_100_000 с 6 децималсами)
        // amount = 1000 * 1_000_000 / 1_100_000 = 909.09 EUR
        let multiplier = 10u64.pow(oracle_decimals as u32);
        amount = (amount as u128 * multiplier as u128 / price as u128) as u64;

        msg!("Current Oracle Price: {}", price);
        msg!("Adjusted Mint Amount: {}", amount);
    }
    
    let seeds = &[b"config".as_ref(), &[config.bump]];
    let signer = &[&seeds[..]];
    
    let cpi_accounts = token_2022::MintTo {
        mint: ctx.accounts.mint.to_account_info(),
        to: ctx.accounts.token_account.to_account_info(),
        authority: config.to_account_info(),
    };
    let cpi_ctx = CpiContext::new_with_signer(ctx.accounts.token_program.to_account_info(), cpi_accounts, signer);
    token_2022::mint_to(cpi_ctx, amount)?;

    emit!(MintEvent {
        to: ctx.accounts.token_account.key(),
        amount,
    });

    Ok(())
}