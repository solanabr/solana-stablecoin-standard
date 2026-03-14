use anchor_lang::prelude::*;
use anchor_lang::solana_program::instruction::AccountMeta;
use anchor_spl::token_interface::{Mint, TokenAccount, TokenInterface};

use crate::state::*;
use crate::errors::SssError;

pub fn add_blacklist_handler(
    ctx: Context<AddToBlacklist>,
    _address: Pubkey,
) -> Result<()> {
    let config = &ctx.accounts.config;
    let clock = Clock::get()?;
    require!(config.is_sss2_or_higher(), SssError::FeatureNotEnabled);

    let roles = &ctx.accounts.roles_config;
    require!(roles.is_blacklister, SssError::Unauthorized);

    let entry = &mut ctx.accounts.blacklist_entry;
    entry.stablecoin = config.key();
    entry.address = ctx.accounts.target.key();
    entry.is_blacklisted = true;
    entry.blacklisted_by = ctx.accounts.authority.key();
    entry.blacklisted_at = clock.unix_timestamp;
    entry.bump = ctx.bumps.blacklist_entry;

    msg!("Blacklisted {}", ctx.accounts.target.key());
    Ok(())
}

pub fn remove_blacklist_handler(ctx: Context<RemoveFromBlacklist>) -> Result<()> {
    let config = &ctx.accounts.config;
    let clock = Clock::get()?;
    require!(config.is_sss2_or_higher(), SssError::FeatureNotEnabled);

    let roles = &ctx.accounts.roles_config;
    require!(roles.is_blacklister, SssError::Unauthorized);

    let entry = &mut ctx.accounts.blacklist_entry;
    entry.is_blacklisted = false;
    entry.removed_by = Some(ctx.accounts.authority.key());
    entry.removed_at = Some(clock.unix_timestamp);

    msg!("Removed {} from blacklist", entry.address);
    Ok(())
}

pub fn seize_handler<'info>(
    ctx: Context<'_, '_, '_, 'info, SeizeTokens<'info>>,
    amount: u64,
) -> Result<()> {
    require!(amount > 0, SssError::InvalidAmount);

    let config = &ctx.accounts.config;
    require!(config.is_sss2_or_higher(), SssError::FeatureNotEnabled);
    require!(!config.is_paused, SssError::Paused);

    let roles = &ctx.accounts.roles_config;
    require!(roles.is_seizer, SssError::Unauthorized);

    // use permanent delegate to transfer tokens out
    let mint_key = ctx.accounts.mint.key();
    let seeds: &[&[u8]] = &[b"config", mint_key.as_ref(), &[config.bump]];

    let mut ix = spl_token_2022::instruction::transfer_checked(
        &ctx.accounts.token_program.key(),
        &ctx.accounts.from_account.key(),
        &ctx.accounts.mint.key(),
        &ctx.accounts.treasury.key(),
        &config.key(), // permanent delegate
        &[],
        amount,
        config.decimals,
    )?;

    let remaining_accounts: Vec<AccountInfo<'info>> = ctx.remaining_accounts.to_vec();

    let mut cpi_account_infos: Vec<AccountInfo<'info>> = vec![
        ctx.accounts.from_account.to_account_info(),
        ctx.accounts.mint.to_account_info(),
        ctx.accounts.treasury.to_account_info(),
        ctx.accounts.config.to_account_info(),
    ];

    for account in remaining_accounts.iter() {
        ix.accounts.push(AccountMeta {
            pubkey: *account.key,
            is_signer: account.is_signer,
            is_writable: account.is_writable,
        });
        cpi_account_infos.push(account.clone());
    }

    anchor_lang::solana_program::program::invoke_signed(
        &ix,
        &cpi_account_infos,
        &[seeds],
    )?;

    msg!("Seized {} tokens from {}", amount, ctx.accounts.from_account.key());
    Ok(())
}

#[derive(Accounts)]
#[instruction(address: Pubkey)]
pub struct AddToBlacklist<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        seeds = [b"config", config.mint.as_ref()],
        bump = config.bump,
    )]
    pub config: Account<'info, StablecoinConfig>,

    /// CHECK: wallet being blacklisted
    pub target: AccountInfo<'info>,

    #[account(
        init_if_needed,
        payer = authority,
        space = BlacklistEntry::SPACE,
        seeds = [b"blacklist", config.key().as_ref(), target.key().as_ref()],
        bump,
    )]
    pub blacklist_entry: Account<'info, BlacklistEntry>,

    #[account(
        seeds = [b"roles", config.key().as_ref(), authority.key().as_ref()],
        bump = roles_config.bump,
    )]
    pub roles_config: Account<'info, RolesConfig>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct RemoveFromBlacklist<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        seeds = [b"config", config.mint.as_ref()],
        bump = config.bump,
    )]
    pub config: Account<'info, StablecoinConfig>,

    #[account(
        mut,
        seeds = [b"blacklist", config.key().as_ref(), blacklist_entry.address.as_ref()],
        bump = blacklist_entry.bump,
    )]
    pub blacklist_entry: Account<'info, BlacklistEntry>,

    #[account(
        seeds = [b"roles", config.key().as_ref(), authority.key().as_ref()],
        bump = roles_config.bump,
    )]
    pub roles_config: Account<'info, RolesConfig>,
}

#[derive(Accounts)]
pub struct SeizeTokens<'info> {
    pub seizer: Signer<'info>,

    #[account(
        seeds = [b"config", mint.key().as_ref()],
        bump = config.bump,
    )]
    pub config: Account<'info, StablecoinConfig>,

    #[account(constraint = mint.key() == config.mint)]
    pub mint: InterfaceAccount<'info, Mint>,

    #[account(
        mut,
        token::mint = mint,
        token::token_program = token_program,
    )]
    pub from_account: InterfaceAccount<'info, TokenAccount>,

    #[account(
        mut,
        token::mint = mint,
        token::token_program = token_program,
    )]
    pub treasury: InterfaceAccount<'info, TokenAccount>,

    #[account(
        seeds = [b"roles", config.key().as_ref(), seizer.key().as_ref()],
        bump = roles_config.bump,
    )]
    pub roles_config: Account<'info, RolesConfig>,

    pub token_program: Interface<'info, TokenInterface>,
}
