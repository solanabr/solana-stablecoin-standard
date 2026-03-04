use anchor_lang::prelude::*;
use anchor_spl::token_interface::TokenAccount;
use sss_token::state::{Blacklist, TokenConfig};

/// The transfer hook execute handler. Called by Token-2022 on every transfer_checked
/// for SSS-2 tokens. We check:
///   1. Token is not paused
///   2. Source owner is not blacklisted
///   3. Destination owner is not blacklisted
///
/// The extra account metas (config + blacklist) are resolved by the ExtraAccountMetaList
/// account that we set up in initialize_extra_metas.

#[derive(Accounts)]
pub struct Execute<'info> {
    /// Source token account
    #[account(token::token_program = anchor_spl::token_2022::ID)]
    pub source: InterfaceAccount<'info, TokenAccount>,

    /// Mint
    /// CHECK: Validated by Token-2022 before calling us
    pub mint: UncheckedAccount<'info>,

    /// Destination token account
    #[account(token::token_program = anchor_spl::token_2022::ID)]
    pub destination: InterfaceAccount<'info, TokenAccount>,

    /// Authority (source owner or delegate)
    /// CHECK: Validated by Token-2022
    pub authority: UncheckedAccount<'info>,

    /// Extra account meta list — used by Token-2022 to find the extra accounts
    /// CHECK: PDA validated below
    #[account(
        seeds = [b"extra-account-metas", mint.key().as_ref()],
        bump,
    )]
    pub extra_account_meta_list: UncheckedAccount<'info>,

    /// SSS TokenConfig — passed as extra account meta
    pub config: Account<'info, TokenConfig>,

    /// SSS Blacklist — passed as extra account meta
    pub blacklist: Account<'info, Blacklist>,
}

pub fn handler(ctx: Context<Execute>, _amount: u64) -> Result<()> {
    let config = &ctx.accounts.config;
    let blacklist = &ctx.accounts.blacklist;

    // Reject if paused
    // Anchor error codes: #[error_code] enum starts at 6000, so Paused (index 1) = 6001
    if config.paused {
        msg!("Transfer rejected: token is paused");
        return Err(ProgramError::Custom(0x1771).into()); // 6001 = SssError::Paused
    }

    // Reject if source owner is blacklisted
    // Blacklisted (index 3 in SssError) = 6003
    let source_owner = ctx.accounts.source.owner;
    if blacklist.contains(&source_owner) {
        msg!("Transfer rejected: source {} is blacklisted", source_owner);
        return Err(ProgramError::Custom(0x1773).into()); // 6003 = SssError::Blacklisted
    }

    // Reject if destination owner is blacklisted
    let dest_owner = ctx.accounts.destination.owner;
    if blacklist.contains(&dest_owner) {
        msg!("Transfer rejected: destination {} is blacklisted", dest_owner);
        return Err(ProgramError::Custom(0x1773).into()); // 6003
    }

    msg!("Transfer hook passed: {} -> {}", source_owner, dest_owner);
    Ok(())
}
