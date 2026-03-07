use anchor_lang::prelude::*;
use anchor_spl::{
    token_2022::Token2022,
    token_interface::Mint,
};
use spl_token_2022::instruction::transfer_checked;
use anchor_lang::solana_program::instruction::AccountMeta;
use anchor_lang::solana_program::program::invoke_signed;
use crate::{
    constants::*,
    error::SssError,
    events::TokensSeized,
    state::StablecoinConfig,
};

#[derive(Accounts)]
pub struct Seize<'info> {
    pub seizer: Signer<'info>,

    #[account(
        seeds = [CONFIG_SEED, mint.key().as_ref()],
        bump = config.bump,
        constraint = config.preset == PRESET_SSS2 @ SssError::InvalidPreset,
        constraint = config.has_seize_authority(&seizer.key()) @ SssError::Unauthorized,
    )]
    pub config: Account<'info, StablecoinConfig>,

    #[account(
        mut,
        address = config.mint,
    )]
    pub mint: InterfaceAccount<'info, Mint>,

    /// CHECK: Token-2022 account to seize from; validated by transfer_checked CPI.
    #[account(mut)]
    pub from_token_account: UncheckedAccount<'info>,

    /// CHECK: Token-2022 account to seize into; validated by transfer_checked CPI.
    #[account(mut)]
    pub to_token_account: UncheckedAccount<'info>,

    pub token_program: Program<'info, Token2022>,

    /// CHECK: The transfer hook program registered on the mint.
    /// Token-2022 requires this account when the mint has a transfer hook.
    pub transfer_hook_program: UncheckedAccount<'info>,

    /// CHECK: ExtraAccountMetaList PDA for the transfer hook.
    /// Seeds: ["extra-account-metas", mint] owned by transfer_hook_program.
    pub extra_account_meta_list: UncheckedAccount<'info>,

    /// CHECK: Blacklist PDA for the source owner (may not exist).
    /// If it exists, Token-2022 hook will reject the transfer.
    pub source_blacklist_entry: UncheckedAccount<'info>,

    /// CHECK: Blacklist PDA for the destination token account (may not exist).
    pub dest_blacklist_entry: UncheckedAccount<'info>,
}

pub fn handler(ctx: Context<Seize>, amount: u64) -> Result<()> {
    let mint_key = ctx.accounts.config.mint;
    let config_bump = ctx.accounts.config.bump;
    let decimals = ctx.accounts.mint.decimals;

    // Build the transfer_checked instruction and append hook accounts so
    // Token-2022 can invoke the transfer hook program during the CPI.
    let mut seize_ix = transfer_checked(
        ctx.accounts.token_program.key,
        &ctx.accounts.from_token_account.key(),
        &mint_key,
        &ctx.accounts.to_token_account.key(),
        &ctx.accounts.config.key(), // permanent delegate = config PDA
        &[],
        amount,
        decimals,
    )?;

    // Append hook accounts to the instruction's AccountMeta list.
    seize_ix.accounts.push(AccountMeta::new_readonly(ctx.accounts.transfer_hook_program.key(), false));
    seize_ix.accounts.push(AccountMeta::new_readonly(ctx.accounts.extra_account_meta_list.key(), false));
    seize_ix.accounts.push(AccountMeta::new_readonly(ctx.accounts.source_blacklist_entry.key(), false));
    seize_ix.accounts.push(AccountMeta::new_readonly(ctx.accounts.dest_blacklist_entry.key(), false));

    invoke_signed(
        &seize_ix,
        &[
            ctx.accounts.from_token_account.to_account_info(),
            ctx.accounts.mint.to_account_info(),
            ctx.accounts.to_token_account.to_account_info(),
            ctx.accounts.config.to_account_info(),
            ctx.accounts.token_program.to_account_info(),
            ctx.accounts.transfer_hook_program.to_account_info(),
            ctx.accounts.extra_account_meta_list.to_account_info(),
            ctx.accounts.source_blacklist_entry.to_account_info(),
            ctx.accounts.dest_blacklist_entry.to_account_info(),
        ],
        &[&[CONFIG_SEED, mint_key.as_ref(), &[config_bump]]],
    )?;

    emit!(TokensSeized {
        mint: mint_key,
        from: ctx.accounts.from_token_account.key(),
        to: ctx.accounts.to_token_account.key(),
        amount,
        by: ctx.accounts.seizer.key(),
    });

    Ok(())
}
