use anchor_lang::prelude::*;
use anchor_spl::token_interface::{self, TransferChecked, TokenInterface};

use crate::state::{StablecoinConfig, RoleManager, BlacklistEntry};
use crate::errors::SssError;

/// Accounts for the seize instruction.
/// Uses permanent delegate authority to transfer tokens from a frozen,
/// blacklisted account to the treasury.
#[derive(Accounts)]
pub struct Seize<'info> {
    /// The seizer signing the transaction.
    #[account(mut)]
    pub seizer: Signer<'info>,

    /// The stablecoin configuration.
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

    /// The blacklist entry proving the address is blacklisted.
    #[account(
        seeds = [b"blacklist", config.key().as_ref(), blacklist_entry.address.as_ref()],
        bump = blacklist_entry.bump,
    )]
    pub blacklist_entry: Account<'info, BlacklistEntry>,

    /// The Token-2022 mint.
    /// CHECK: Validated via config constraint.
    #[account(address = config.mint)]
    pub mint: AccountInfo<'info>,

    /// The frozen token account to seize from (must belong to blacklisted address).
    /// CHECK: Validated in handler.
    #[account(mut)]
    pub from_token_account: AccountInfo<'info>,

    /// The treasury token account to receive seized tokens.
    /// CHECK: Validated by token program CPI.
    #[account(mut)]
    pub treasury_token_account: AccountInfo<'info>,

    /// Token-2022 program.
    pub token_program: Interface<'info, TokenInterface>,
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

    // Feature gate: compliance must be enabled
    require!(config.is_compliance_enabled(), SssError::ComplianceNotEnabled);
    require!(config.enable_permanent_delegate, SssError::ComplianceNotEnabled);

    // Check authorization
    require!(
        seizer_key == role_manager.seizer || seizer_key == role_manager.master_authority,
        SssError::UnauthorizedSeizer
    );

    // TODO: Phase 3 — Full implementation:
    // 1. Verify the from_token_account is frozen
    // 2. Get the balance of the from_token_account
    // 3. Use permanent delegate to transfer all tokens to treasury
    // 4. This requires CPI with the config PDA as the permanent delegate authority

    let amount = 0u64; // Placeholder — will read actual balance in Phase 3

    emit!(TokensSeized {
        config: config.key(),
        from: ctx.accounts.from_token_account.key(),
        to: ctx.accounts.treasury_token_account.key(),
        amount,
        seized_by: seizer_key,
    });

    Ok(())
}
