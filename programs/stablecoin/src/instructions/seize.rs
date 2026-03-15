use anchor_lang::prelude::*;
use anchor_lang::solana_program::program::invoke_signed;
use anchor_spl::token_2022::spl_token_2022::{
    self,
    instruction as token_instruction,
    state::Account as TokenAccount,
};
use spl_token_2022::extension::StateWithExtensions;

use crate::errors::StablecoinError;
use crate::state::{StablecoinConfig, RoleAssignment, BlacklistEntry, Role};

#[derive(Accounts)]
pub struct Seize<'info> {
    /// The seizer (must have Seizer role).
    pub seizer: Signer<'info>,

    /// Stablecoin configuration PDA (permanent delegate + mint authority).
    #[account(
        mut,
        seeds = [b"stablecoin-config", config.mint.as_ref()],
        bump = config.bump,
        constraint = config.is_compliance_enabled() @ StablecoinError::ComplianceNotEnabled,
    )]
    pub config: Account<'info, StablecoinConfig>,

    /// Role assignment for the seizer.
    #[account(
        seeds = [b"role", config.key().as_ref(), seizer.key().as_ref()],
        bump = role_assignment.bump,
        constraint = role_assignment.has_role(Role::Seizer) @ StablecoinError::Unauthorized,
    )]
    pub role_assignment: Account<'info, RoleAssignment>,

    /// The blacklist entry proving the target wallet is blacklisted.
    #[account(
        seeds = [b"blacklist", config.mint.as_ref(), blacklist_entry.address.as_ref()],
        bump = blacklist_entry.bump,
    )]
    pub blacklist_entry: Account<'info, BlacklistEntry>,

    /// The Token-2022 mint.
    /// CHECK: Validated against config.
    #[account(mut, address = config.mint)]
    pub mint: AccountInfo<'info>,

    /// The blacklisted account to seize tokens from.
    /// CHECK: Validated by owner check in handler + token-2022 CPI.
    #[account(mut)]
    pub source: AccountInfo<'info>,

    /// The destination account to receive seized tokens (treasury).
    /// CHECK: Validated by token-2022 during CPI.
    #[account(mut)]
    pub destination: AccountInfo<'info>,

    /// Token-2022 program.
    /// CHECK: Validated by address.
    #[account(address = spl_token_2022::ID)]
    pub token_program: AccountInfo<'info>,
}

pub fn handler(ctx: Context<Seize>, amount: u64) -> Result<()> {
    require!(amount > 0, StablecoinError::ZeroAmount);

    // ── CRITICAL SECURITY CHECK ──────────────────────────────────
    let source_data = ctx.accounts.source.try_borrow_data()?;
    let source_account = StateWithExtensions::<TokenAccount>::unpack(&source_data)?;
    let source_owner = source_account.base.owner;
    let source_mint = source_account.base.mint;
    drop(source_data);

    require!(
        source_owner == ctx.accounts.blacklist_entry.address,
        StablecoinError::SourceOwnerMismatch
    );

    require!(
        source_mint == ctx.accounts.config.mint,
        StablecoinError::SourceOwnerMismatch
    );

    // ── Seize via burn + mint ────────────────────────────────────
    // Uses burn (permanent delegate) + mint_to (mint authority) to bypass
    // transfer hooks. A seize IS the compliance action, so it should not
    // be subject to the transfer hook's compliance checks.
    let mint_key = ctx.accounts.config.mint;
    let config_seeds: &[&[u8]] = &[
        b"stablecoin-config",
        mint_key.as_ref(),
        &[ctx.accounts.config.bump],
    ];

    // Step 1: Burn tokens from the blacklisted source (as permanent delegate)
    invoke_signed(
        &token_instruction::burn_checked(
            &spl_token_2022::ID,
            ctx.accounts.source.key,
            ctx.accounts.mint.key,
            &ctx.accounts.config.key(),
            &[],
            amount,
            ctx.accounts.config.decimals,
        )?,
        &[
            ctx.accounts.source.to_account_info(),
            ctx.accounts.mint.to_account_info(),
            ctx.accounts.config.to_account_info(),
        ],
        &[config_seeds],
    )?;

    // Step 2: Mint equivalent tokens to treasury (as mint authority)
    invoke_signed(
        &token_instruction::mint_to(
            &spl_token_2022::ID,
            ctx.accounts.mint.key,
            ctx.accounts.destination.key,
            &ctx.accounts.config.key(),
            &[],
            amount,
        )?,
        &[
            ctx.accounts.mint.to_account_info(),
            ctx.accounts.destination.to_account_info(),
            ctx.accounts.config.to_account_info(),
        ],
        &[config_seeds],
    )?;

    msg!(
        "Seized {} tokens from blacklisted address {} to {}",
        amount,
        ctx.accounts.blacklist_entry.address,
        ctx.accounts.destination.key
    );
    Ok(())
}
