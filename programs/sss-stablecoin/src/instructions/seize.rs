//! Seize instruction for compliance enforcement (SSS-2)

use crate::{
    compliance, constants::CONFIG_SEED, error::StablecoinError, events::Seized,
    state::StablecoinConfig,
};
use anchor_lang::{
    prelude::*,
    solana_program::{instruction::AccountMeta, program::invoke_signed},
};
use anchor_spl::token_interface::{Mint, Token2022, TokenAccount};
use spl_token_2022::instruction as token_2022_instruction;

/// Seize tokens from an account to the treasury
pub fn handler(ctx: Context<Seize>, args: SeizeArgs) -> Result<()> {
    let config = &ctx.accounts.config;
    require!(
        config.compliance_enabled,
        StablecoinError::ComplianceDisabled
    );
    require!(
        config.permanent_delegate_enabled,
        StablecoinError::PermanentDelegateDisabled
    );
    require!(
        is_seizer(config, &ctx.accounts.authority.key()),
        StablecoinError::Unauthorized
    );

    // Check blacklist requirement
    if config.seize_requires_blacklist && !args.override_requires_blacklist {
        compliance::validate_blacklisted(
            &ctx.accounts.source_compliance_record,
            &ctx.accounts.source.owner,
            &ctx.accounts.mint.key(),
        )?;
    }

    // Validate token accounts
    require_keys_eq!(
        ctx.accounts.destination.key(),
        config.treasury,
        StablecoinError::InvalidTreasury
    );
    require_keys_eq!(
        ctx.accounts.source.mint,
        ctx.accounts.mint.key(),
        StablecoinError::InvalidTokenAccount
    );
    require_keys_eq!(
        ctx.accounts.destination.mint,
        ctx.accounts.mint.key(),
        StablecoinError::InvalidTokenAccount
    );

    // Transfer tokens using permanent delegate
    let mint_key = ctx.accounts.mint.key();
    let config_seeds: &[&[u8]] = &[CONFIG_SEED, mint_key.as_ref(), &[config.bump]];
    let signer_seeds: &[&[&[u8]]] = &[config_seeds];

    let mut transfer_ix = token_2022_instruction::transfer_checked(
        &ctx.accounts.token_program.key(),
        &ctx.accounts.source.key(),
        &ctx.accounts.mint.key(),
        &ctx.accounts.destination.key(),
        &ctx.accounts.config.key(),
        &[],
        args.amount,
        ctx.accounts.mint.decimals,
    )?;
    transfer_ix.accounts.extend([
        AccountMeta::new_readonly(ctx.accounts.transfer_hook_program.key(), false),
        AccountMeta::new_readonly(ctx.accounts.extra_account_meta_list.key(), false),
        AccountMeta::new_readonly(ctx.accounts.hook_config.key(), false),
        AccountMeta::new_readonly(ctx.accounts.stablecoin_program.key(), false),
        AccountMeta::new_readonly(ctx.accounts.config.key(), false),
        AccountMeta::new_readonly(ctx.accounts.source_compliance_record.key(), false),
        AccountMeta::new_readonly(ctx.accounts.destination_compliance_record.key(), false),
    ]);

    let account_infos = vec![
        ctx.accounts.source.to_account_info(),
        ctx.accounts.mint.to_account_info(),
        ctx.accounts.destination.to_account_info(),
        ctx.accounts.config.to_account_info(),
        ctx.accounts.transfer_hook_program.to_account_info(),
        ctx.accounts.extra_account_meta_list.to_account_info(),
        ctx.accounts.hook_config.to_account_info(),
        ctx.accounts.stablecoin_program.to_account_info(),
        ctx.accounts.config.to_account_info(),
        ctx.accounts.source_compliance_record.to_account_info(),
        ctx.accounts.destination_compliance_record.to_account_info(),
    ];

    invoke_signed(&transfer_ix, &account_infos, signer_seeds)?;

    emit!(Seized {
        mint: ctx.accounts.mint.key(),
        source: ctx.accounts.source.key(),
        destination: ctx.accounts.destination.key(),
        source_owner: ctx.accounts.source.owner,
        authority: ctx.accounts.authority.key(),
        amount: args.amount,
        override_requires_blacklist: args.override_requires_blacklist,
    });

    Ok(())
}

fn is_seizer(config: &StablecoinConfig, signer: &Pubkey) -> bool {
    *signer == config.master_authority || *signer == config.seizer
}

#[derive(Accounts)]
pub struct Seize<'info> {
    pub authority: Signer<'info>,

    #[account(
        seeds = [CONFIG_SEED, mint.key().as_ref()],
        bump = config.bump,
        has_one = mint @ StablecoinError::InvalidMint
    )]
    pub config: Account<'info, StablecoinConfig>,

    #[account(mut)]
    pub mint: InterfaceAccount<'info, Mint>,

    #[account(mut)]
    pub source: InterfaceAccount<'info, TokenAccount>,

    #[account(mut)]
    pub destination: InterfaceAccount<'info, TokenAccount>,

    /// CHECK: source compliance record; validated in instruction.
    pub source_compliance_record: UncheckedAccount<'info>,
    /// CHECK: treasury compliance record for transfer-hook validation.
    pub destination_compliance_record: UncheckedAccount<'info>,

    /// CHECK: transfer-hook program executed by Token-2022.
    pub transfer_hook_program: UncheckedAccount<'info>,
    /// CHECK: transfer-hook validation PDA for this mint.
    pub extra_account_meta_list: UncheckedAccount<'info>,
    /// CHECK: transfer-hook configuration PDA for this mint.
    pub hook_config: UncheckedAccount<'info>,
    /// CHECK: executable stablecoin program account needed by the hook.
    pub stablecoin_program: UncheckedAccount<'info>,

    pub token_program: Program<'info, Token2022>,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct SeizeArgs {
    pub amount: u64,
    pub override_requires_blacklist: bool,
}
