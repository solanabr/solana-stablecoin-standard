use anchor_lang::prelude::*;
use anchor_spl::token_2022::{transfer_checked, Token2022, TransferChecked};
use anchor_spl::token_interface::{Mint, TokenAccount};

use crate::errors::StablecoinError;
use crate::events::*;
use crate::state::{RoleRegistry, StablecoinConfig};

#[derive(Accounts)]
pub struct Seize<'info> {
    #[account(
        seeds = [StablecoinConfig::SEED_PREFIX.as_bytes(), config.authority.as_ref(), config.symbol.as_bytes()],
        bump = config.bump
    )]
    pub config: Account<'info, StablecoinConfig>,
    #[account(
        seeds = [RoleRegistry::SEED_PREFIX.as_bytes(), config.key().as_ref()],
        bump = role_registry.bump
    )]
    pub role_registry: Account<'info, RoleRegistry>,
    #[account(mut, constraint = mint.key() == config.mint)]
    pub mint: InterfaceAccount<'info, Mint>,
    #[account(mut, token::mint = mint, token::token_program = token_program)]
    pub target_ata: InterfaceAccount<'info, TokenAccount>,
    #[account(mut, token::mint = mint, token::token_program = token_program)]
    pub treasury_ata: InterfaceAccount<'info, TokenAccount>,
    #[account(mut)]
    pub seizer: Signer<'info>,
    pub token_program: Program<'info, Token2022>,
}

pub fn seize(ctx: Context<Seize>) -> Result<()> {
    let config = &ctx.accounts.config;
    require!(
        config.enable_permanent_delegate && config.enable_transfer_hook,
        StablecoinError::ComplianceNotEnabled
    );

    let seizer = ctx.accounts.seizer.key();
    let allowed = ctx.accounts.role_registry.master == seizer
        || ctx.accounts.role_registry.seizers.contains(&seizer);
    require!(allowed, StablecoinError::Unauthorized);

    require!(
        ctx.accounts.target_ata.is_frozen(),
        StablecoinError::AccountNotFrozen
    );

    let amount = ctx.accounts.target_ata.amount;
    require!(amount > 0, StablecoinError::ZeroAmount);

    let signer_seeds = &[
        StablecoinConfig::SEED_PREFIX.as_bytes(),
        config.authority.as_ref(),
        config.symbol.as_bytes(),
        &[config.bump],
    ];
    let signer_binding = [&signer_seeds[..]];
    let cpi_ctx = CpiContext::new_with_signer(
        ctx.accounts.token_program.to_account_info(),
        TransferChecked {
            from: ctx.accounts.target_ata.to_account_info(),
            mint: ctx.accounts.mint.to_account_info(),
            to: ctx.accounts.treasury_ata.to_account_info(),
            authority: ctx.accounts.config.to_account_info(),
        },
        &signer_binding,
    );
    transfer_checked(cpi_ctx, amount, config.decimals)?;

    emit!(TokensSeized {
        seizer,
        from: ctx.accounts.target_ata.owner,
        to: ctx.accounts.treasury_ata.owner,
        amount,
    });

    Ok(())
}
