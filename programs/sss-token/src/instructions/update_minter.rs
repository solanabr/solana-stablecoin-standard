use anchor_lang::prelude::*;

use crate::errors::SssError;
use crate::events::MinterUpdated;
use crate::state::*;
use crate::utils::require_master_authority;

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct UpdateMinterParams {
    pub is_active: bool,
    pub mint_quota: u64,
}

#[derive(Accounts)]
pub struct UpdateMinter<'info> {
    #[account(mut)]
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

    #[account(
        init_if_needed,
        payer = authority,
        space = MinterInfo::SPACE,
        seeds = [MinterInfo::SEED_PREFIX, config.key().as_ref(), minter_wallet.key().as_ref()],
        bump,
        constraint = minter_info.config == config.key() || minter_info.config == Pubkey::default() @ SssError::InvalidAuthority,
    )]
    pub minter_info: Account<'info, MinterInfo>,

    /// CHECK: Wallet address of the minter. Only used as PDA seed — not validated
    /// beyond zero-address check. Minter is activated separately via is_active flag.
    pub minter_wallet: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<UpdateMinter>, params: UpdateMinterParams) -> Result<()> {
    require_master_authority(&ctx.accounts.role_registry, &ctx.accounts.authority.key())?;

    require!(
        ctx.accounts.minter_wallet.key() != Pubkey::default(),
        SssError::ZeroAuthority
    );

    let clock = Clock::get()?;
    let minter_info = &mut ctx.accounts.minter_info;

    // If newly created, set initial fields
    if minter_info.config == Pubkey::default() {
        minter_info.bump = ctx.bumps.minter_info;
        minter_info.config = ctx.accounts.config.key();
        minter_info.minter = ctx.accounts.minter_wallet.key();
        minter_info.total_minted = 0;
        minter_info.created_at = clock.unix_timestamp;
        minter_info.last_mint_at = 0;
    }

    minter_info.is_active = params.is_active;
    minter_info.mint_quota = params.mint_quota;

    ctx.accounts.config.updated_at = clock.unix_timestamp;

    emit!(MinterUpdated {
        config: ctx.accounts.config.key(),
        minter: ctx.accounts.minter_wallet.key(),
        is_active: params.is_active,
        mint_quota: params.mint_quota,
        updated_by: ctx.accounts.authority.key(),
        timestamp: clock.unix_timestamp,
    });

    Ok(())
}
