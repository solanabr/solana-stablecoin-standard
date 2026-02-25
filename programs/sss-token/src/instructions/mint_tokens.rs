use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token_interface::{mint_to, Mint, MintTo, TokenAccount, TokenInterface},
};

use crate::{
    constants::*,
    error::SSSError,
    events::TokensMinted,
    state::{MinterInfo, RoleManager, StablecoinConfig},
};

#[derive(Accounts)]
pub struct MintTokens<'info> {
    #[account(mut)]
    pub minter: Signer<'info>,

    #[account(
        mut,
        seeds = [STABLECOIN_SEED, mint.key().as_ref()],
        bump = stablecoin_config.bump,
    )]
    pub stablecoin_config: Account<'info, StablecoinConfig>,

    #[account(
        seeds = [ROLES_SEED, stablecoin_config.key().as_ref()],
        bump = role_manager.bump,
    )]
    pub role_manager: Account<'info, RoleManager>,

    #[account(
        mut,
        seeds = [MINTER_SEED, stablecoin_config.key().as_ref(), minter.key().as_ref()],
        bump = minter_info.bump,
    )]
    pub minter_info: Account<'info, MinterInfo>,

    #[account(mut)]
    pub mint: InterfaceAccount<'info, Mint>,

    #[account(
        init_if_needed,
        payer = minter,
        associated_token::mint = mint,
        associated_token::authority = recipient,
        associated_token::token_program = token_program,
    )]
    pub recipient_token_account: InterfaceAccount<'info, TokenAccount>,

    /// CHECK: recipient's wallet address
    pub recipient: UncheckedAccount<'info>,

    pub token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<MintTokens>, amount: u64) -> Result<()> {
    require!(amount > 0, SSSError::ZeroAmount);

    let config = &ctx.accounts.stablecoin_config;
    let roles = &ctx.accounts.role_manager;
    let minter_key = ctx.accounts.minter.key();

    require!(!config.paused, SSSError::Paused);
    require!(
        roles.minters.contains(&minter_key),
        SSSError::Unauthorized
    );

    let minter_info = &mut ctx.accounts.minter_info;
    let new_minted = minter_info
        .minted
        .checked_add(amount)
        .ok_or(SSSError::MathOverflow)?;
    if minter_info.quota > 0 {
        require!(new_minted <= minter_info.quota, SSSError::QuotaExceeded);
    }
    minter_info.minted = new_minted;

    let mint_key = ctx.accounts.mint.key();
    let bump = ctx.accounts.stablecoin_config.bump;
    let config_info = ctx.accounts.stablecoin_config.to_account_info();

    mint_to(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            MintTo {
                mint: ctx.accounts.mint.to_account_info(),
                to: ctx.accounts.recipient_token_account.to_account_info(),
                authority: config_info,
            },
            &[&[STABLECOIN_SEED, mint_key.as_ref(), &[bump]]],
        ),
        amount,
    )?;

    let config = &mut ctx.accounts.stablecoin_config;
    config.total_minted = config
        .total_minted
        .checked_add(amount)
        .ok_or(SSSError::MathOverflow)?;

    emit!(TokensMinted {
        mint: mint_key,
        recipient: ctx.accounts.recipient.key(),
        amount,
        minter: minter_key,
    });

    Ok(())
}
