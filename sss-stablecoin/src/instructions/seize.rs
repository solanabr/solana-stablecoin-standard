use anchor_lang::prelude::*;
use anchor_lang::solana_program::program::invoke_signed;
use anchor_spl::token_2022::{thaw_account, ThawAccount, Token2022};
use anchor_spl::token_interface::{Mint, TokenAccount};
use spl_transfer_hook_interface::onchain::add_extra_accounts_for_execute_cpi;

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
    /// CHECK: transfer-hook program configured on the mint
    pub transfer_hook_program: UncheckedAccount<'info>,
    /// CHECK: transfer-hook validation PDA for this mint
    pub extra_account_meta_list: UncheckedAccount<'info>,
    /// CHECK: stablecoin program id account used by transfer-hook PDA resolution
    pub stablecoin_program: UncheckedAccount<'info>,
    /// CHECK: blacklist PDA for source owner
    pub sender_blacklist: UncheckedAccount<'info>,
    /// CHECK: blacklist PDA for destination owner
    pub receiver_blacklist: UncheckedAccount<'info>,
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

    let expected_extra_meta = spl_transfer_hook_interface::get_extra_account_metas_address(
        &ctx.accounts.mint.key(),
        &ctx.accounts.transfer_hook_program.key(),
    );
    require_keys_eq!(
        ctx.accounts.extra_account_meta_list.key(),
        expected_extra_meta,
        StablecoinError::InvalidRole
    );
    require_keys_eq!(
        ctx.accounts.stablecoin_program.key(),
        crate::ID,
        StablecoinError::InvalidRole
    );

    let thaw_ctx = CpiContext::new_with_signer(
        ctx.accounts.token_program.to_account_info(),
        ThawAccount {
            account: ctx.accounts.target_ata.to_account_info(),
            mint: ctx.accounts.mint.to_account_info(),
            authority: ctx.accounts.config.to_account_info(),
        },
        &signer_binding,
    );
    thaw_account(thaw_ctx)?;

    let mut transfer_ix = spl_token_2022::instruction::transfer_checked(
        &spl_token_2022::id(),
        &ctx.accounts.target_ata.key(),
        &ctx.accounts.mint.key(),
        &ctx.accounts.treasury_ata.key(),
        &ctx.accounts.config.key(),
        &[],
        amount,
        config.decimals,
    )?;

    let mut transfer_account_infos = vec![
        ctx.accounts.target_ata.to_account_info(),
        ctx.accounts.mint.to_account_info(),
        ctx.accounts.treasury_ata.to_account_info(),
        ctx.accounts.config.to_account_info(),
    ];

    let additional_hook_accounts = vec![
        ctx.accounts.transfer_hook_program.to_account_info(),
        ctx.accounts.extra_account_meta_list.to_account_info(),
        ctx.accounts.stablecoin_program.to_account_info(),
        ctx.accounts.config.to_account_info(),
        ctx.accounts.sender_blacklist.to_account_info(),
        ctx.accounts.receiver_blacklist.to_account_info(),
    ];

    add_extra_accounts_for_execute_cpi(
        &mut transfer_ix,
        &mut transfer_account_infos,
        &ctx.accounts.transfer_hook_program.key(),
        ctx.accounts.target_ata.to_account_info(),
        ctx.accounts.mint.to_account_info(),
        ctx.accounts.treasury_ata.to_account_info(),
        ctx.accounts.config.to_account_info(),
        amount,
        &additional_hook_accounts,
    )?;

    invoke_signed(&transfer_ix, &transfer_account_infos, &signer_binding)?;

    emit!(TokensSeized {
        seizer,
        from: ctx.accounts.target_ata.owner,
        to: ctx.accounts.treasury_ata.owner,
        amount,
    });

    Ok(())
}
