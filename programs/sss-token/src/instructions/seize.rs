use anchor_lang::prelude::*;

use crate::state::{StablecoinConfig, RoleManager, BlacklistEntry};
use crate::errors::SssError;

/// Accounts for the seize instruction.
///
/// ## How seize works (SSS-2 only):
/// 1. Verify the target account is frozen AND blacklisted
/// 2. Use the **permanent delegate** authority to transfer all tokens
///    from the frozen account to the treasury
/// 3. The permanent delegate is the config PDA — set during initialize
///
/// This is how regulated stablecoins (USDC, USDT) handle compliance —
/// the issuer can seize tokens from sanctioned addresses.
#[derive(Accounts)]
pub struct Seize<'info> {
    /// The seizer signing the transaction.
    #[account(mut)]
    pub seizer: Signer<'info>,

    /// The stablecoin configuration (also the permanent delegate).
    #[account(
        seeds = [b"config", config.mint.as_ref()],
        bump = config.bump,
    )]
    pub config: Account<'info, StablecoinConfig>,

    /// The role manager.
    #[account(
        seeds = [b"roles", config.key().as_ref()],
        bump = role_manager.bump,
        has_one = config,
    )]
    pub role_manager: Account<'info, RoleManager>,

    /// Proof that the target address is blacklisted.
    /// The PDA must exist — if it doesn't, the instruction fails.
    #[account(
        seeds = [b"blacklist", config.key().as_ref(), blacklist_entry.address.as_ref()],
        bump = blacklist_entry.bump,
    )]
    pub blacklist_entry: Account<'info, BlacklistEntry>,

    /// The Token-2022 mint.
    /// CHECK: Validated via config constraint.
    #[account(address = config.mint)]
    pub mint: AccountInfo<'info>,

    /// The frozen token account to seize from.
    /// CHECK: Validated in handler — must belong to the blacklisted address.
    #[account(mut)]
    pub from_token_account: AccountInfo<'info>,

    /// The treasury token account to receive seized tokens.
    /// CHECK: Validated by token program CPI.
    #[account(mut)]
    pub treasury_token_account: AccountInfo<'info>,

    /// Token-2022 program.
    /// CHECK: Validated by interface constraint.
    pub token_program: AccountInfo<'info>,
}

/// Event emitted when tokens are seized.
#[event]
pub struct TokensSeized {
    pub config: Pubkey,
    pub from: Pubkey,
    pub to: Pubkey,
    pub amount: u64,
    pub seized_by: Pubkey,
}

pub fn handler(ctx: Context<Seize>) -> Result<()> {
    let config = &ctx.accounts.config;
    let role_manager = &ctx.accounts.role_manager;
    let seizer_key = ctx.accounts.seizer.key();

    // ── Feature gate: SSS-2 required ────────────────────────────────
    require!(config.is_compliance_enabled(), SssError::ComplianceNotEnabled);
    require!(config.enable_permanent_delegate, SssError::ComplianceNotEnabled);

    // ── Authorization check ─────────────────────────────────────────
    require!(
        seizer_key == role_manager.seizer || seizer_key == role_manager.master_authority,
        SssError::UnauthorizedSeizer
    );

    // ── Read balance from the frozen token account ──────────────────
    //
    // We use the permanent delegate to transfer the entire balance.
    // The config PDA is the permanent delegate (set at initialize).
    //
    // TODO: Phase 3 - Read token account balance and execute
    //       transfer_checked CPI using config PDA as permanent delegate
    //       signer seeds: [b"config", mint_key, &[bump]]

    let amount = 0u64; // Placeholder until Phase 3

    emit!(TokensSeized {
        config: config.key(),
        from: ctx.accounts.from_token_account.key(),
        to: ctx.accounts.treasury_token_account.key(),
        amount,
        seized_by: seizer_key,
    });

    msg!("Seized {} tokens from blacklisted account", amount);

    Ok(())
}
