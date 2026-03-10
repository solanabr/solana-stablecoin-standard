use anchor_lang::prelude::*;
use anchor_lang::solana_program::program::invoke;
use anchor_lang::solana_program::system_instruction;
use anchor_spl::{
    token_interface::{Mint, TokenAccount, TokenInterface},
    token_2022::{self, spl_token_2022}, // <-- Добавили импорт spl_token_2022 отсюда
};
use anchor_spl::token_2022::spl_token_2022::extension::ExtensionType; // <-- Исправленный путь
use token_2022::spl_token_2022::extension::transfer_hook::instruction::initialize as initialize_transfer_hook;
use anchor_spl::token_2022::{ MintTo, Burn, TransferChecked}; 

pub mod state;
pub mod error;

use state::StablecoinConfig;
use error::StablecoinError;

declare_id!("451UiDzutoMvqZkEj94PSNQTZELV4JqWRdiSoiJB9bxp");

#[program]
pub mod sss_core {
    use super::*;

    pub fn initialize(
        ctx: Context<Initialize>,
        decimals: u8,
        enable_permanent_delegate: bool, // <-- Добавили
        enable_transfer_hook: bool,
        name: String,
        symbol: String,
        uri: String,
    ) -> Result<()> {
        let config = &mut ctx.accounts.config;
        let config_key = config.key();
        
        // // 1. Вычисляем точный размер для базового Token-2022 (без расширений)
        // let extension_types = Vec::new(); 
        // let mint_len = ExtensionType::try_calculate_account_len::<spl_token_2022::state::Mint>(&extension_types)
        //     .map_err(|_| ProgramError::InvalidAccountData)?;
            
        // let rent = Rent::get()?;
        // let lamports = rent.minimum_balance(mint_len);

        // // 2. Создаем аккаунт изнутри смарт-контракта!
        // msg!("1. Creating Mint Account...");
        // invoke(
        //     &system_instruction::create_account(
        //         ctx.accounts.payer.key,
        //         ctx.accounts.mint.key,
        //         lamports,
        //         mint_len as u64,
        //         &ctx.accounts.token_program.key(),
        //     ),
        //     &[
        //         ctx.accounts.payer.to_account_info(),
        //         ctx.accounts.mint.to_account_info(),
        //     ],
        // )?;

        // // 3. Инициализируем сам токен
        // msg!("2. Initializing Mint2...");
        // invoke(
        //     &token_2022::spl_token_2022::instruction::initialize_mint2(
        //         &ctx.accounts.token_program.key(),
        //         ctx.accounts.mint.key,
        //         &config_key,
        //         Some(&config_key),
        //         decimals,
        //     )?,
        //     &[ctx.accounts.mint.to_account_info()],
        // )?;

        // if ctx.accounts.transfer_hook_program_id.is_some() {
        //     msg!("3. Initializing Transfer Hook...");
        //     let hook_program = ctx.accounts.transfer_hook_program_id.as_ref().unwrap();
        //     let init_hook_ix = initialize_transfer_hook(
        //         &ctx.accounts.token_program.key(),
        //         &ctx.accounts.mint.key(),
        //         Some(config_key),
        //         Some(hook_program.key()), // Наша программа-перехватчик
        //     )?;
        //     invoke(&init_hook_ix, &[ctx.accounts.mint.to_account_info()])?;
        // }

        // 4. Сохраняем все метаданные в PDA!
        config.authority = ctx.accounts.payer.key();
        config.mint = ctx.accounts.mint.key();
        config.name = name;
        config.symbol = symbol;
        config.uri = uri;
        config.decimals = decimals;
        config.is_paused = false;
        config.enable_permanent_delegate = false;
        config.enable_transfer_hook = false;
        config.minter_authority = ctx.accounts.payer.key();
        config.burner_authority = ctx.accounts.payer.key();
        config.freezer_authority = ctx.accounts.payer.key();
        config.bump = ctx.bumps.config;
        config.enable_permanent_delegate = enable_permanent_delegate;
        config.seizer_authority = ctx.accounts.payer.key(); 

        msg!("✅ Stablecoin {} Created Successfully!", config.symbol);
        Ok(())
    }

    pub fn mint_token(ctx: Context<MintToken>, amount: u64) -> Result<()> {
        let config = &ctx.accounts.config;
        require_keys_eq!(ctx.accounts.signer.key(), config.minter_authority, StablecoinError::Unauthorized);
        let seeds = &[b"config".as_ref(), &[config.bump]];
        let signer = &[&seeds[..]];
        let cpi_accounts = token_2022::MintTo {
            mint: ctx.accounts.mint.to_account_info(),
            to: ctx.accounts.token_account.to_account_info(),
            authority: config.to_account_info(),
        };
        let cpi_ctx = CpiContext::new_with_signer(ctx.accounts.token_program.to_account_info(), cpi_accounts, signer);
        token_2022::mint_to(cpi_ctx, amount)?;
        Ok(())
    }

    pub fn burn_token(ctx: Context<BurnToken>, amount: u64) -> Result<()> {
        let config = &ctx.accounts.config;
        require_keys_eq!(ctx.accounts.signer.key(), config.burner_authority, StablecoinError::Unauthorized);
        let cpi_accounts = token_2022::Burn {
            mint: ctx.accounts.mint.to_account_info(),
            from: ctx.accounts.token_account.to_account_info(),
            authority: ctx.accounts.signer.to_account_info(),
        };
        let cpi_ctx = CpiContext::new(ctx.accounts.token_program.to_account_info(), cpi_accounts);
        token_2022::burn(cpi_ctx, amount)?;
        Ok(())
    }

    pub fn seize_tokens(ctx: Context<SeizeTokens>, amount: u64) -> Result<()> {
        let config = &ctx.accounts.config;
        
        // 1. Проверка: только seizer может это делать
        require_keys_eq!(ctx.accounts.signer.key(), config.seizer_authority, StablecoinError::Unauthorized);
        
        // 2. Проверка: включен ли делегат
        require!(config.enable_permanent_delegate, StablecoinError::FeatureNotEnabled);

        // 3. Подпись PDA (config)
        let seeds = &[b"config".as_ref(), &[config.bump]];
        let signer = &[&seeds[..]];

        // 4. CPI вызов
        let cpi_accounts = TransferChecked {
            from: ctx.accounts.frozen_account.to_account_info(),
            mint: ctx.accounts.mint.to_account_info(),
            to: ctx.accounts.treasury_account.to_account_info(),
            authority: config.to_account_info(), // Наш PDA подписывает как Permanent Delegate
        };

        let cpi_program = ctx.accounts.token_program.to_account_info();
        let cpi_ctx = CpiContext::new_with_signer(cpi_program, cpi_accounts, signer);

        token_2022::transfer_checked(cpi_ctx, amount, ctx.accounts.mint.decimals)?;

        msg!("✅ Tokens seized successfully!");
        Ok(())
    }
}

#[derive(Accounts)]
#[instruction(decimals: u8, enable_permanent_delegate: bool, enable_transfer_hook: bool, name: String, symbol: String, uri: String)]
pub struct Initialize<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    #[account(
        init,
        payer = payer,
        space = 8 + StablecoinConfig::INIT_SPACE,
        seeds = [b"config"],
        bump
    )]
    pub config: Account<'info, StablecoinConfig>,

    /// CHECK:
    #[account(mut, signer)]
    pub mint: AccountInfo<'info>,

    /// CHECK: Опциональный адрес программы Transfer Hook (Для SSS-2)
    pub transfer_hook_program_id: Option<UncheckedAccount<'info>>,

    pub token_program: Interface<'info, TokenInterface>,
    pub system_program: Program<'info, System>,

}

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
    pub token_program: Interface<'info, TokenInterface>,
}

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

#[derive(Accounts)]
pub struct SeizeTokens<'info> {
    #[account(mut)]
    pub signer: Signer<'info>, // Тот, кто вызывает
    #[account(seeds = [b"config"], bump = config.bump)]
    pub config: Account<'info, StablecoinConfig>,
    #[account(mut, address = config.mint)]
    pub mint: InterfaceAccount<'info, Mint>,
    #[account(mut)]
    pub frozen_account: InterfaceAccount<'info, TokenAccount>, // Откуда изымаем
    #[account(mut)]
    pub treasury_account: InterfaceAccount<'info, TokenAccount>, // Куда кладем
    pub token_program: Interface<'info, TokenInterface>,
}