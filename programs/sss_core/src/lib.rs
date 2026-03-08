use anchor_lang::prelude::*;
use anchor_spl::{
    token_interface::{Mint, TokenInterface},
    token_2022::{self, spl_token_2022},
};
// Импортируем "линейку" Pack, чтобы компилятор знал, что такое Mint::LEN
use anchor_lang::solana_program::program_pack::Pack;

pub mod state;
use state::StablecoinConfig;

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
        
        // В этой версии Anchor это структура, поэтому обращаемся через точку
        config.bump = ctx.bumps.config;

        msg!("Stablecoin Configured Successfully!");

        // Инициализируем Mint (токен) вручную через CPI
        let cpi_accounts = token_2022::InitializeMint2 {
            mint: ctx.accounts.mint.to_account_info(),
        };
        let cpi_program = ctx.accounts.token_program.to_account_info();
        let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);
        
        token_2022::initialize_mint2(
            cpi_ctx,
            decimals,
            &ctx.accounts.config.key(), // Mint Authority
            Some(&ctx.accounts.config.key()), // Freeze Authority
        )?;

        msg!("Mint Initialized with Token-2022!");
        
        Ok(())
    }
}

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    #[account(
        init,
        payer = payer,
        space = StablecoinConfig::INIT_SPACE,
        seeds = [b"config"],
        bump
    )]
    pub config: Account<'info, StablecoinConfig>,

    /// CHECK: Мы инициализируем этот аккаунт вручную.
    #[account(
        init,
        payer = payer,
        // Теперь Mint::LEN будет найден, так как мы импортировали Pack
        space = spl_token_2022::state::Mint::LEN,
        owner = token_program.key(),
    )]
    pub mint: UncheckedAccount<'info>,

    pub token_program: Interface<'info, TokenInterface>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}