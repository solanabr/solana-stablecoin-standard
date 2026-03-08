use anchor_lang::prelude::*;
use anchor_spl::{
    token_interface::{Mint, TokenAccount, TokenInterface},
    token_2022::{self, spl_token_2022},
};
use anchor_lang::solana_program::program_pack::Pack;

pub mod state;
pub mod error; // Подключаем наши ошибки

use state::StablecoinConfig;
use error::StablecoinError;

declare_id!("Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS");

#[program]
pub mod sss_core {
    use super::*;

    pub fn initialize(
        ctx: Context<Initialize>,
        decimals: u8,
        enable_permanent_delegate: bool,
        enable_transfer_hook: bool,
    ) -> Result<()> {
        let config = &mut ctx.accounts.config;
        config.authority = ctx.accounts.payer.key();
        config.mint = ctx.accounts.mint.key();
        config.is_paused = false;
        config.enable_permanent_delegate = enable_permanent_delegate;
        config.enable_transfer_hook = enable_transfer_hook;
        config.bump = ctx.bumps.config;

        // По умолчанию все роли отдаем создателю контракта
        config.minter_authority = ctx.accounts.payer.key();
        config.burner_authority = ctx.accounts.payer.key();
        config.freezer_authority = ctx.accounts.payer.key();

        let cpi_accounts = token_2022::InitializeMint2 {
            mint: ctx.accounts.mint.to_account_info(),
        };
        let cpi_program = ctx.accounts.token_program.to_account_info();
        let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);
        
        token_2022::initialize_mint2(
            cpi_ctx,
            decimals,
            &ctx.accounts.config.key(),
            Some(&ctx.accounts.config.key()),
        )?;

        msg!("Stablecoin Initialized with Decimals: {}", decimals);
        Ok(())
    }

    // --- ФУНКЦИЯ ПЕЧАТИ ТОКЕНОВ (MINT) ---
    pub fn mint_token(ctx: Context<MintToken>, amount: u64) -> Result<()> {
        let config = &ctx.accounts.config;

        // Проверка прав: Только minter_authority может печатать деньги!
        require_keys_eq!(
            ctx.accounts.signer.key(),
            config.minter_authority,
            StablecoinError::Unauthorized
        );

        // Программа должна подписать CPI вызов как владелец токена (PDA подпись)
        let seeds = &[b"config".as_ref(), &[config.bump]];
        let signer = &[&seeds[..]];

        let cpi_accounts = token_2022::MintTo {
            mint: ctx.accounts.mint.to_account_info(),
            to: ctx.accounts.token_account.to_account_info(),
            authority: config.to_account_info(), // Наш PDA — Владелец
        };

        let cpi_program = ctx.accounts.token_program.to_account_info();
        let cpi_ctx = CpiContext::new_with_signer(cpi_program, cpi_accounts, signer);

        token_2022::mint_to(cpi_ctx, amount)?;

        msg!("Minted {} tokens successfully!", amount);
        Ok(())
    }

    // --- ФУНКЦИЯ СЖИГАНИЯ ТОКЕНОВ (BURN) ---
    pub fn burn_token(ctx: Context<BurnToken>, amount: u64) -> Result<()> {
        let config = &ctx.accounts.config;

        // Проверка прав: Только burner_authority может сжигать деньги
        require_keys_eq!(
            ctx.accounts.signer.key(),
            config.burner_authority,
            StablecoinError::Unauthorized
        );

        // Для сжигания подписывает сам владелец кошелька, с которого сжигаем
        let cpi_accounts = token_2022::Burn {
            mint: ctx.accounts.mint.to_account_info(),
            from: ctx.accounts.token_account.to_account_info(),
            authority: ctx.accounts.signer.to_account_info(),
        };

        let cpi_program = ctx.accounts.token_program.to_account_info();
        let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);

        token_2022::burn(cpi_ctx, amount)?;

        msg!("Burned {} tokens successfully!", amount);
        Ok(())
    }
}

// --- СТРУКТУРЫ ДЛЯ АККАУНТОВ ---

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(init, payer = payer, space = StablecoinConfig::INIT_SPACE, seeds = [b"config"], bump)]
    pub config: Account<'info, StablecoinConfig>,
    /// CHECK: Инициализируется внутри
    #[account(init, payer = payer, space = spl_token_2022::state::Mint::LEN, owner = token_program.key())]
    pub mint: UncheckedAccount<'info>,
    pub token_program: Interface<'info, TokenInterface>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
pub struct MintToken<'info> {
    #[account(mut)]
    pub signer: Signer<'info>, // Тот, кто вызывает транзакцию
    #[account(seeds = [b"config"], bump = config.bump)]
    pub config: Account<'info, StablecoinConfig>, // PDA с настройками
    #[account(mut, address = config.mint)]
    pub mint: InterfaceAccount<'info, Mint>, // Проверяем, что это ИМЕННО наш токен
    #[account(mut)]
    pub token_account: InterfaceAccount<'info, TokenAccount>, // Кошелек, куда упадут токены
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
    pub token_account: InterfaceAccount<'info, TokenAccount>, // Кошелек, откуда сжигаем
    pub token_program: Interface<'info, TokenInterface>,
}