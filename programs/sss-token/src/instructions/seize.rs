use anchor_lang::prelude::*;
use anchor_spl::{
    token_2022::{self, Burn, FreezeAccount, MintTo, ThawAccount, Token2022},
    token_interface::TokenAccount,
};

use crate::errors::SssError;
use crate::events::TokensSeized;
use crate::state::*;
use crate::utils::require_role;

#[derive(Accounts)]
pub struct Seize<'info> {
    pub authority: Signer<'info>,

    #[account(
        mut,
        seeds = [StablecoinConfig::SEED_PREFIX, config.mint.as_ref()],
        bump = config.bump,
    )]
    pub config: Account<'info, StablecoinConfig>,

    #[account(
        seeds = [RoleRegistry::SEED_PREFIX, config.key().as_ref()],
        bump = role_registry.bump,
        constraint = role_registry.config == config.key() @ SssError::InvalidAuthority,
    )]
    pub role_registry: Account<'info, RoleRegistry>,

    /// Proves the target is blacklisted
    #[account(
        seeds = [BlacklistEntry::SEED_PREFIX, config.key().as_ref(), blacklist_entry.blocked_address.as_ref()],
        bump = blacklist_entry.bump,
        constraint = blacklist_entry.config == config.key(),
    )]
    pub blacklist_entry: Account<'info, BlacklistEntry>,

    /// CHECK: The Token-2022 mint account. Address validated against config, owner against Token-2022.
    #[account(
        mut,
        address = config.mint,
        constraint = mint.owner == &token_program.key() @ SssError::InvalidAuthority,
    )]
    pub mint: UncheckedAccount<'info>,

    /// The token account to seize from (must be owned by the blacklisted address)
    #[account(
        mut,
        token::mint = config.mint,
        token::authority = blacklist_entry.blocked_address,
        token::token_program = token_program,
    )]
    pub from_token_account: InterfaceAccount<'info, TokenAccount>,

    /// The destination token account (e.g., treasury)
    #[account(
        mut,
        token::mint = config.mint,
        token::token_program = token_program,
    )]
    pub to_token_account: InterfaceAccount<'info, TokenAccount>,

    pub token_program: Program<'info, Token2022>,
}

pub fn handler(ctx: Context<Seize>, amount: u64) -> Result<()> {
    let config = &ctx.accounts.config;

    require!(
        config.enable_permanent_delegate,
        SssError::FeatureNotEnabled
    );

    require_role(
        &ctx.accounts.role_registry,
        &ctx.accounts.authority.key(),
        Role::Seizer,
    )?;

    require!(amount > 0, SssError::SeizeAmountZero);

    require!(
        ctx.accounts.from_token_account.key() != ctx.accounts.to_token_account.key(),
        SssError::SeizeSameAccount
    );

    let clock = Clock::get()?;
    let mint_key = config.mint;
    let signer_seeds: &[&[&[u8]]] = &[&[
        StablecoinConfig::SEED_PREFIX,
        mint_key.as_ref(),
        &[config.bump],
    ]];

    require!(
        ctx.accounts.from_token_account.amount >= amount,
        SssError::InsufficientBalance
    );

    // Step 1: Thaw the frozen account (blacklisted accounts are frozen)
    token_2022::thaw_account(CpiContext::new_with_signer(
        ctx.accounts.token_program.to_account_info(),
        ThawAccount {
            account: ctx.accounts.from_token_account.to_account_info(),
            mint: ctx.accounts.mint.to_account_info(),
            authority: ctx.accounts.config.to_account_info(),
        },
        signer_seeds,
    ))?;

    // Step 2: Burn tokens from the seized account (config PDA is permanent delegate)
    // Using burn+mint instead of transfer_checked avoids triggering the transfer hook,
    // which is correct since seize is a privileged program operation, not a user transfer.
    token_2022::burn(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            Burn {
                mint: ctx.accounts.mint.to_account_info(),
                from: ctx.accounts.from_token_account.to_account_info(),
                authority: ctx.accounts.config.to_account_info(), // permanent delegate
            },
            signer_seeds,
        ),
        amount,
    )?;

    // Step 3: Mint equivalent tokens to the destination (treasury)
    token_2022::mint_to(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            MintTo {
                mint: ctx.accounts.mint.to_account_info(),
                to: ctx.accounts.to_token_account.to_account_info(),
                authority: ctx.accounts.config.to_account_info(), // mint authority
            },
            signer_seeds,
        ),
        amount,
    )?;

    // Step 4: Re-freeze the account (it's still blacklisted)
    token_2022::freeze_account(CpiContext::new_with_signer(
        ctx.accounts.token_program.to_account_info(),
        FreezeAccount {
            account: ctx.accounts.from_token_account.to_account_info(),
            mint: ctx.accounts.mint.to_account_info(),
            authority: ctx.accounts.config.to_account_info(),
        },
        signer_seeds,
    ))?;

    let config = &mut ctx.accounts.config;
    config.total_seized = config
        .total_seized
        .checked_add(amount)
        .ok_or(SssError::Overflow)?;
    config.updated_at = clock.unix_timestamp;

    emit!(TokensSeized {
        config: config.key(),
        from: ctx.accounts.from_token_account.key(),
        amount,
        seized_by: ctx.accounts.authority.key(),
        timestamp: clock.unix_timestamp,
    });

    Ok(())
}
