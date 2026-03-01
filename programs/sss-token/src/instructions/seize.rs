use anchor_lang::prelude::*;
use anchor_spl::token_interface::{self, Mint, TokenAccount, TokenInterface, TransferChecked};

use crate::state::{BlacklistEntry, Role, RoleAssignment, StablecoinState};
use super::SssError;

/// Seize tokens from a blacklisted account using the permanent delegate authority.
/// The stablecoin PDA acts as permanent delegate, transferring all tokens to a treasury.
#[derive(Accounts)]
pub struct Seize<'info> {
    pub seizer: Signer<'info>,

    #[account(
        seeds = [b"stablecoin", mint.key().as_ref()],
        bump = stablecoin_state.bump,
        constraint = stablecoin_state.compliance_enabled @ SssError::ComplianceNotEnabled,
        constraint = stablecoin_state.permanent_delegate_enabled @ SssError::ComplianceNotEnabled,
    )]
    pub stablecoin_state: Account<'info, StablecoinState>,

    #[account(
        seeds = [b"role", stablecoin_state.key().as_ref(), Role::Seizer.seed(), seizer.key().as_ref()],
        bump = role_assignment.bump,
        constraint = role_assignment.active @ SssError::Unauthorized,
    )]
    pub role_assignment: Account<'info, RoleAssignment>,

    /// Blacklist entry proving the target is blacklisted.
    #[account(
        seeds = [b"blacklist", stablecoin_state.key().as_ref(), from.owner.as_ref()],
        bump = blacklist_entry.bump,
    )]
    pub blacklist_entry: Account<'info, BlacklistEntry>,

    #[account(constraint = mint.key() == stablecoin_state.mint)]
    pub mint: InterfaceAccount<'info, Mint>,

    /// The blacklisted user's token account — tokens will be seized from here.
    #[account(
        mut,
        constraint = from.mint == mint.key(),
    )]
    pub from: InterfaceAccount<'info, TokenAccount>,

    /// Treasury token account — seized tokens go here.
    #[account(
        mut,
        constraint = treasury.mint == mint.key(),
    )]
    pub treasury: InterfaceAccount<'info, TokenAccount>,

    pub token_program: Interface<'info, TokenInterface>,
}

pub fn seize_handler(ctx: Context<Seize>) -> Result<()> {
    let amount = ctx.accounts.from.amount;
    if amount == 0 {
        msg!("SSS: Nothing to seize, balance is 0");
        return Ok(());
    }

    let mint_key = ctx.accounts.mint.key();
    let seeds = &[b"stablecoin", mint_key.as_ref(), &[ctx.accounts.stablecoin_state.bump]];
    let signer_seeds = &[&seeds[..]];

    // Transfer using permanent delegate authority (the stablecoin PDA)
    token_interface::transfer_checked(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            TransferChecked {
                from: ctx.accounts.from.to_account_info(),
                mint: ctx.accounts.mint.to_account_info(),
                to: ctx.accounts.treasury.to_account_info(),
                authority: ctx.accounts.stablecoin_state.to_account_info(),
            },
            signer_seeds,
        ),
        amount,
        ctx.accounts.stablecoin_state.decimals,
    )?;

    msg!(
        "SSS: Seized {} tokens from {} to treasury",
        amount,
        ctx.accounts.from.key()
    );
    Ok(())
}
