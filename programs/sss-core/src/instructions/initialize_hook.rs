use anchor_lang::prelude::*;
use anchor_spl::token_2022::Token2022;

use crate::error::SssError;
use crate::events::HookInitialized;
use crate::state::StablecoinConfig;

/// Anchor discriminator for global:initialize_hook_config (sha256("global:initialize_hook_config")[..8])
const INIT_HOOK_CONFIG_DISC: [u8; 8] = [144, 239, 17, 85, 228, 48, 54, 43];

/// Anchor discriminator for global:initialize_extra_account_meta_list (sha256("global:initialize_extra_account_meta_list")[..8])
const INIT_EXTRA_META_LIST_DISC: [u8; 8] = [92, 197, 174, 197, 41, 124, 19, 3];

#[derive(Accounts)]
pub struct InitializeHook<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    #[account(
        constraint = admin.key() == config.admin @ SssError::Unauthorized,
    )]
    pub admin: Signer<'info>,

    #[account(
        seeds = [b"sss_config", config.mint.as_ref()],
        bump = config.bump,
        has_one = mint,
        constraint = config.preset.has_compliance_features() @ SssError::PresetFeatureUnavailable,
    )]
    pub config: Account<'info, StablecoinConfig>,

    /// CHECK: The mint — validated by has_one on config
    pub mint: UncheckedAccount<'info>,

    /// CHECK: HookConfig PDA to be created
    #[account(mut)]
    pub hook_config: UncheckedAccount<'info>,

    /// CHECK: ExtraAccountMetaList PDA to be created
    #[account(mut)]
    pub extra_account_meta_list: UncheckedAccount<'info>,

    /// CHECK: The transfer hook program
    #[account(
        constraint = transfer_hook_program.key() == config.transfer_hook_program @ SssError::Unauthorized,
    )]
    pub transfer_hook_program: UncheckedAccount<'info>,

    pub token_program: Program<'info, Token2022>,
    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<InitializeHook>) -> Result<()> {
    let config = &ctx.accounts.config;
    let cs = crate::utils::ConfigSeeds::new(config);
    let seeds = cs.as_seeds();
    let signer_seeds: &[&[&[u8]]] = &[&seeds];

    // CPI 1: Initialize HookConfig on transfer hook program
    // authority = config PDA (so sss-core can manage blacklists)
    let ix_data = INIT_HOOK_CONFIG_DISC.to_vec();

    let ix = anchor_lang::solana_program::instruction::Instruction {
        program_id: ctx.accounts.transfer_hook_program.key(),
        accounts: vec![
            anchor_lang::solana_program::instruction::AccountMeta::new(ctx.accounts.payer.key(), true),
            anchor_lang::solana_program::instruction::AccountMeta::new_readonly(ctx.accounts.config.key(), true), // authority (PDA signer)
            anchor_lang::solana_program::instruction::AccountMeta::new_readonly(ctx.accounts.mint.key(), false),
            anchor_lang::solana_program::instruction::AccountMeta::new(ctx.accounts.hook_config.key(), false),
            anchor_lang::solana_program::instruction::AccountMeta::new_readonly(ctx.accounts.system_program.key(), false),
        ],
        data: ix_data,
    };

    anchor_lang::solana_program::program::invoke_signed(
        &ix,
        &[
            ctx.accounts.payer.to_account_info(),
            ctx.accounts.config.to_account_info(),
            ctx.accounts.mint.to_account_info(),
            ctx.accounts.hook_config.to_account_info(),
            ctx.accounts.system_program.to_account_info(),
        ],
        signer_seeds,
    )?;

    // CPI 2: Initialize ExtraAccountMetaList on transfer hook program
    let ix_data2 = INIT_EXTRA_META_LIST_DISC.to_vec();

    let ix2 = anchor_lang::solana_program::instruction::Instruction {
        program_id: ctx.accounts.transfer_hook_program.key(),
        accounts: vec![
            anchor_lang::solana_program::instruction::AccountMeta::new(ctx.accounts.payer.key(), true),
            anchor_lang::solana_program::instruction::AccountMeta::new(ctx.accounts.extra_account_meta_list.key(), false),
            anchor_lang::solana_program::instruction::AccountMeta::new_readonly(ctx.accounts.mint.key(), false),
            anchor_lang::solana_program::instruction::AccountMeta::new_readonly(ctx.accounts.hook_config.key(), false),
            anchor_lang::solana_program::instruction::AccountMeta::new_readonly(ctx.accounts.token_program.key(), false),
            anchor_lang::solana_program::instruction::AccountMeta::new_readonly(ctx.accounts.system_program.key(), false),
        ],
        data: ix_data2,
    };

    anchor_lang::solana_program::program::invoke(
        &ix2,
        &[
            ctx.accounts.payer.to_account_info(),
            ctx.accounts.extra_account_meta_list.to_account_info(),
            ctx.accounts.mint.to_account_info(),
            ctx.accounts.hook_config.to_account_info(),
            ctx.accounts.token_program.to_account_info(),
            ctx.accounts.system_program.to_account_info(),
        ],
    )?;

    emit!(HookInitialized {
        config: config.key(),
        mint: ctx.accounts.mint.key(),
        transfer_hook_program: ctx.accounts.transfer_hook_program.key(),
        initialized_by: ctx.accounts.admin.key(),
    });

    Ok(())
}
