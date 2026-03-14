use anchor_lang::prelude::*;
use anchor_spl::token_2022;
use anchor_spl::token_interface::{
    Mint, TokenAccount, TokenInterface,
    Burn, FreezeAccount, ThawAccount, MintTo,
};

use crate::constants::*;
use crate::error::StablecoinError;
use crate::events::TokensSeized;
use crate::state::{StablecoinConfig, RoleAssignment, BlacklistEntry};

#[derive(Accounts)]
pub struct SeizeTokens<'info> {
    pub seizer: Signer<'info>,

    #[account(
        mut,
        seeds = [CONFIG_SEED, config.mint.as_ref()],
        bump = config.bump,
        constraint = config.compliance_enabled @ StablecoinError::ComplianceNotEnabled,
        constraint = !config.paused @ StablecoinError::Paused,
    )]
    pub config: Box<Account<'info, StablecoinConfig>>,

    /// Seizer role assignment
    #[account(
        seeds = [ROLE_SEED, config.key().as_ref(), &[ROLE_SEIZER], seizer.key().as_ref()],
        bump = seizer_role.bump,
        constraint = seizer_role.config == config.key() @ StablecoinError::Unauthorized,
        constraint = seizer_role.role == ROLE_SEIZER @ StablecoinError::Unauthorized,
        constraint = seizer_role.active @ StablecoinError::RoleNotActive,
    )]
    pub seizer_role: Box<Account<'info, RoleAssignment>>,

    /// Blacklist entry proves the target is blacklisted (must be active)
    #[account(
        seeds = [BLACKLIST_SEED, config.key().as_ref(), target_owner.key().as_ref()],
        bump = blacklist_entry.bump,
        constraint = blacklist_entry.config == config.key() @ StablecoinError::SeizeNonBlacklisted,
        constraint = blacklist_entry.active @ StablecoinError::SeizeNonBlacklisted,
    )]
    pub blacklist_entry: Box<Account<'info, BlacklistEntry>>,

    /// CHECK: The owner of the source token account (blacklisted party)
    pub target_owner: UncheckedAccount<'info>,

    #[account(
        mut,
        constraint = mint.key() == config.mint @ StablecoinError::Unauthorized,
    )]
    pub mint: Box<InterfaceAccount<'info, Mint>>,

    /// Source token account (owned by blacklisted address, typically frozen)
    #[account(
        mut,
        token::mint = mint,
    )]
    pub source_token_account: Box<InterfaceAccount<'info, TokenAccount>>,

    /// Destination token account (treasury, receives newly minted tokens)
    #[account(
        mut,
        token::mint = mint,
    )]
    pub treasury_token_account: Box<InterfaceAccount<'info, TokenAccount>>,

    pub token_program: Interface<'info, TokenInterface>,
}

/// Atomic seize: thaw -> burn -> refreeze -> mint to treasury.
pub fn seize_handler(ctx: Context<SeizeTokens>, amount: u64) -> Result<()> {
    require!(amount > 0, StablecoinError::ZeroAmount);

    let mint_key = ctx.accounts.config.mint;
    let bump = ctx.accounts.config.bump;
    let signer_seeds: &[&[&[u8]]] = &[&[
        CONFIG_SEED,
        mint_key.as_ref(),
        &[bump],
    ]];

    // Step 1: Thaw the frozen account (config PDA is freeze authority)
    token_2022::thaw_account(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            ThawAccount {
                account: ctx.accounts.source_token_account.to_account_info(),
                mint: ctx.accounts.mint.to_account_info(),
                authority: ctx.accounts.config.to_account_info(),
            },
            signer_seeds,
        ),
    )?;

    // Step 2: Burn tokens from the blacklisted account via permanent delegate
    token_2022::burn(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            Burn {
                mint: ctx.accounts.mint.to_account_info(),
                from: ctx.accounts.source_token_account.to_account_info(),
                authority: ctx.accounts.config.to_account_info(),
            },
            signer_seeds,
        ),
        amount,
    )?;

    // Step 3: Refreeze the account (maintain frozen-by-default invariant)
    token_2022::freeze_account(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            FreezeAccount {
                account: ctx.accounts.source_token_account.to_account_info(),
                mint: ctx.accounts.mint.to_account_info(),
                authority: ctx.accounts.config.to_account_info(),
            },
            signer_seeds,
        ),
    )?;

    // Step 4: Mint equivalent tokens to treasury
    token_2022::mint_to(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            MintTo {
                mint: ctx.accounts.mint.to_account_info(),
                to: ctx.accounts.treasury_token_account.to_account_info(),
                authority: ctx.accounts.config.to_account_info(),
            },
            signer_seeds,
        ),
        amount,
    )?;

    let config = &mut ctx.accounts.config;
    config.total_minted = config.total_minted
        .checked_add(amount)
        .ok_or(StablecoinError::MathOverflow)?;
    config.total_burned = config.total_burned
        .checked_add(amount)
        .ok_or(StablecoinError::MathOverflow)?;

    emit!(TokensSeized {
        config: config.key(),
        from: ctx.accounts.source_token_account.key(),
        to: ctx.accounts.treasury_token_account.key(),
        amount,
        seizer: ctx.accounts.seizer.key(),
    });

    Ok(())
}
