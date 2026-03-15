use anchor_lang::prelude::*;
use anchor_spl::{
    token_2022::{self, MintTo, Token2022},
    token_interface::TokenAccount,
};

use crate::errors::SssError;
use crate::events::TokensMinted;
use crate::state::*;
use crate::utils::{require_blacklist_enabled, require_not_paused};

#[derive(Accounts)]
pub struct MintTokens<'info> {
    #[account(mut)]
    pub minter_authority: Signer<'info>,

    #[account(
        mut,
        seeds = [StablecoinConfig::SEED_PREFIX, config.mint.as_ref()],
        bump = config.bump,
    )]
    pub config: Account<'info, StablecoinConfig>,

    #[account(
        mut,
        seeds = [MinterInfo::SEED_PREFIX, config.key().as_ref(), minter_authority.key().as_ref()],
        bump = minter_info.bump,
        constraint = minter_info.config == config.key(),
    )]
    pub minter_info: Account<'info, MinterInfo>,

    /// CHECK: The Token-2022 mint account. Address validated against config, owner against Token-2022.
    #[account(
        mut,
        address = config.mint,
        constraint = mint.owner == &token_program.key() @ SssError::InvalidAuthority,
    )]
    pub mint: UncheckedAccount<'info>,

    #[account(
        mut,
        token::mint = config.mint,
        token::token_program = token_program,
    )]
    pub recipient_token_account: InterfaceAccount<'info, TokenAccount>,

    /// CHECK: Blacklist PDA for the recipient token account owner.
    /// Mandatory account — callers cannot omit it, preventing blacklist bypass.
    /// The PDA seeds are derived from the on-chain token account owner (not caller input)
    /// so callers cannot spoof a clean wallet address.
    /// When permanent_delegate is enabled and this PDA has data, the mint is rejected
    /// because a BlacklistEntry exists for the recipient.
    /// When permanent_delegate is disabled, the account is still required but ignored.
    #[account(
        seeds = [
            BlacklistEntry::SEED_PREFIX,
            config.key().as_ref(),
            recipient_token_account.owner.as_ref(),
        ],
        bump,
    )]
    pub recipient_blacklist: UncheckedAccount<'info>,

    pub token_program: Program<'info, Token2022>,
}

pub fn handler(ctx: Context<MintTokens>, amount: u64) -> Result<()> {
    require!(amount > 0, SssError::MintAmountZero);

    let config = &ctx.accounts.config;
    require_not_paused(config)?;

    // SSS-2: Mandatory blacklist check — recipient_blacklist is always required (not Optional),
    // so callers cannot skip the check by omitting the account.
    // The PDA seeds constraint above validates derivation from the actual token account owner.
    if require_blacklist_enabled(config).is_ok() {
        // If the blacklist PDA has data, a BlacklistEntry exists for this recipient — reject.
        if !ctx.accounts.recipient_blacklist.data_is_empty() {
            return Err(SssError::RecipientBlacklisted.into());
        }
    }

    let minter_info = &ctx.accounts.minter_info;
    require!(minter_info.is_active, SssError::MinterNotActive);
    require!(minter_info.can_mint(amount), SssError::MintQuotaExceeded);

    if config.supply_cap > 0 {
        let new_supply = config
            .current_supply()
            .checked_add(amount)
            .ok_or(SssError::Overflow)?;
        require!(new_supply <= config.supply_cap, SssError::SupplyCapExceeded);
    }

    let clock = Clock::get()?;

    // Mint tokens via CPI (config PDA is mint authority)
    let mint_key = config.mint;
    let signer_seeds: &[&[&[u8]]] = &[&[
        StablecoinConfig::SEED_PREFIX,
        mint_key.as_ref(),
        &[config.bump],
    ]];

    token_2022::mint_to(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            MintTo {
                mint: ctx.accounts.mint.to_account_info(),
                to: ctx.accounts.recipient_token_account.to_account_info(),
                authority: ctx.accounts.config.to_account_info(),
            },
            signer_seeds,
        ),
        amount,
    )?;

    // Update minter stats
    let minter_info = &mut ctx.accounts.minter_info;
    minter_info.total_minted = minter_info
        .total_minted
        .checked_add(amount)
        .ok_or(SssError::Overflow)?;
    minter_info.last_mint_at = clock.unix_timestamp;

    // Update config stats
    let config = &mut ctx.accounts.config;
    config.total_minted = config
        .total_minted
        .checked_add(amount)
        .ok_or(SssError::Overflow)?;
    config.updated_at = clock.unix_timestamp;

    emit!(TokensMinted {
        config: config.key(),
        minter: ctx.accounts.minter_authority.key(),
        recipient: ctx.accounts.recipient_token_account.key(),
        amount,
        total_minted: config.total_minted,
        timestamp: clock.unix_timestamp,
    });

    Ok(())
}
