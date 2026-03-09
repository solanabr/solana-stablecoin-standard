use anchor_lang::prelude::*;
use anchor_spl::{
    token_interface::{Mint, TokenAccount, TokenInterface},
    token_2022,
};

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
        _decimals: u8,
        _name: String,
        _symbol: String,
        _uri: String,
    ) -> Result<()> {
        let config = &mut ctx.accounts.config;
        
        // Просто сохраняем настройки в наш PDA
        config.authority = ctx.accounts.payer.key();
        config.mint = ctx.accounts.mint.key();
        config.is_paused = false;
        config.minter_authority = ctx.accounts.payer.key();
        config.burner_authority = ctx.accounts.payer.key();
        config.freezer_authority = ctx.accounts.payer.key();
        config.bump = ctx.bumps.config;

        msg!("✅ SSS-1 Config PDA Created!");
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
}

#[derive(Accounts)]
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

    // Убрали все init и макросы. Просто проверяем, что это Mint аккаунт
    pub mint: InterfaceAccount<'info, Mint>,

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