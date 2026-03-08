use anchor_lang::prelude::*;
use anchor_spl::{
    token_interface::{Mint, TokenAccount, TokenInterface},
    token_2022::{self, spl_token_2022},
};
// Библиотеки для ручных вызовов (CPI) метаданных
use solana_program::program::{invoke, invoke_signed};
use spl_token_metadata_interface::{
    instruction as token_metadata_ix,
    state::Field,
};

pub mod state;
pub mod error;

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
        name: String,
        symbol: String,
        uri: String,
    ) -> Result<()> {
        let config = &mut ctx.accounts.config;
        config.authority = ctx.accounts.payer.key();
        config.mint = ctx.accounts.mint.key();
        config.is_paused = false;
        config.enable_permanent_delegate = enable_permanent_delegate;
        config.enable_transfer_hook = enable_transfer_hook;
        config.bump = ctx.bumps.config;
        config.minter_authority = ctx.accounts.payer.key();
        config.burner_authority = ctx.accounts.payer.key();
        config.freezer_authority = ctx.accounts.payer.key();

        msg!("1. Initializing Metadata Pointer Extension...");
        let init_meta_pointer_ix = spl_token_2022::extension::metadata_pointer::instruction::initialize(
            &ctx.accounts.token_program.key(),
            &ctx.accounts.mint.key(),
            Some(config.key()), // Кто может обновлять (наш PDA)
            Some(ctx.accounts.mint.key()), // Где лежат данные (прямо тут же)
        )?;
        invoke(&init_meta_pointer_ix, &[ctx.accounts.mint.to_account_info(), config.to_account_info()])?;

        msg!("2. Initializing Mint...");
        let cpi_accounts = token_2022::InitializeMint2 { mint: ctx.accounts.mint.to_account_info() };
        let cpi_ctx = CpiContext::new(ctx.accounts.token_program.to_account_info(), cpi_accounts);
        token_2022::initialize_mint2(cpi_ctx, decimals, &config.key(), Some(&config.key()))?;

        msg!("3. Writing Token Metadata...");
        let seeds = &[b"config".as_ref(), &[config.bump]];
        let signer = &[&seeds[..]];

        let init_token_meta_ix = token_metadata_ix::initialize(
            &ctx.accounts.token_program.key(),
            &ctx.accounts.mint.key(),
            &config.key(), // Metadata Authority
            &ctx.accounts.mint.key(), // Mint
            &config.key(), // Mint Authority
            name,
            symbol,
            uri,
        );
        invoke_signed(
            &init_token_meta_ix,
            &[ctx.accounts.mint.to_account_info(), config.to_account_info()],
            signer,
        )?;

        msg!("Stablecoin Fully Created with Metadata!");
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

    // --- ФУНКЦИЯ ОБНОВЛЕНИЯ МЕТАДАННЫХ ---
    pub fn update_metadata(
        ctx: Context<UpdateMetadata>,
        name: String,
        symbol: String,
        uri: String,
    ) -> Result<()> {
        let config = &ctx.accounts.config;
        
        // Только главный админ может менять логотип и название
        require_keys_eq!(ctx.accounts.signer.key(), config.authority, StablecoinError::Unauthorized);

        let seeds = &[b"config".as_ref(), &[config.bump]];
        let signer = &[&seeds[..]];

        // Обновляем Имя
        invoke_signed(
            &token_metadata_ix::update_field(&ctx.accounts.token_program.key(), &ctx.accounts.mint.key(), &config.key(), Field::Name, name),
            &[ctx.accounts.mint.to_account_info(), config.to_account_info()],
            signer,
        )?;
        
        // Обновляем Символ
        invoke_signed(
            &token_metadata_ix::update_field(&ctx.accounts.token_program.key(), &ctx.accounts.mint.key(), &config.key(), Field::Symbol, symbol),
            &[ctx.accounts.mint.to_account_info(), config.to_account_info()],
            signer,
        )?;

        // Обновляем Логотип (URI)
        invoke_signed(
            &token_metadata_ix::update_field(&ctx.accounts.token_program.key(), &ctx.accounts.mint.key(), &config.key(), Field::Uri, uri),
            &[ctx.accounts.mint.to_account_info(), config.to_account_info()],
            signer,
        )?;

        msg!("Metadata Updated Successfully!");
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
    
    /// CHECK: Выделяем 500 байт — это с запасом хватит для Mint + Метаданные (Name, Symbol, Uri)
    #[account(init, payer = payer, space = 500, owner = token_program.key())]
    pub mint: UncheckedAccount<'info>,
    
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
pub struct UpdateMetadata<'info> {
    #[account(mut)]
    pub signer: Signer<'info>,
    #[account(seeds = [b"config"], bump = config.bump)]
    pub config: Account<'info, StablecoinConfig>,
    /// CHECK: Указываем аккаунт вручную для CPI
    #[account(mut, address = config.mint)]
    pub mint: UncheckedAccount<'info>,
    pub token_program: Interface<'info, TokenInterface>,
}