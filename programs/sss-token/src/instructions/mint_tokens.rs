use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token_2022::{mint_to, MintTo, Token2022},
    token_interface::{Mint, TokenAccount},
};
use crate::{
    constants::*,
    error::SssError,
    events::TokensMinted,
    state::{MinterInfo, StablecoinConfig},
};

#[derive(Accounts)]
pub struct MintTokens<'info> {
    /// The minter must be an authorized, active minter
    #[account(mut)]
    pub minter: Signer<'info>,

    #[account(
        mut,
        seeds = [CONFIG_SEED, mint.key().as_ref()],
        bump = config.bump,
        constraint = !config.paused @ SssError::ContractPaused,
    )]
    pub config: Account<'info, StablecoinConfig>,

    #[account(
        mut,
        seeds = [MINTER_SEED, mint.key().as_ref(), minter.key().as_ref()],
        bump = minter_info.bump,
        constraint = minter_info.active @ SssError::MinterInactive,
        constraint = minter_info.minter == minter.key() @ SssError::Unauthorized,
    )]
    pub minter_info: Account<'info, MinterInfo>,

    #[account(
        mut,
        address = config.mint,
    )]
    pub mint: InterfaceAccount<'info, Mint>,

    #[account(
        init_if_needed,
        payer = minter,
        associated_token::mint = mint,
        associated_token::authority = recipient,
        associated_token::token_program = token_program,
    )]
    pub recipient_token_account: InterfaceAccount<'info, TokenAccount>,

    /// CHECK: recipient is just a wallet address
    pub recipient: UncheckedAccount<'info>,

    pub token_program: Program<'info, Token2022>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<MintTokens>, amount: u64) -> Result<()> {
    let config = &ctx.accounts.config;
    let minter_info = &mut ctx.accounts.minter_info;

    // Quota enforcement (0 = unlimited)
    if minter_info.quota > 0 {
        let new_minted = minter_info
            .minted
            .checked_add(amount)
            .ok_or(error!(SssError::Overflow))?;
        require!(new_minted <= minter_info.quota, SssError::QuotaExceeded);
        minter_info.minted = new_minted;
    }

    let mint_key = config.mint;
    let config_bump = config.bump;

    // Mint via config PDA (mint authority = config PDA)
    mint_to(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            MintTo {
                mint: ctx.accounts.mint.to_account_info(),
                to: ctx.accounts.recipient_token_account.to_account_info(),
                authority: ctx.accounts.config.to_account_info(),
            },
            &[&[CONFIG_SEED, mint_key.as_ref(), &[config_bump]]],
        ),
        amount,
    )?;

    emit!(TokensMinted {
        mint: mint_key,
        recipient: ctx.accounts.recipient.key(),
        amount,
        minter: ctx.accounts.minter.key(),
    });

    Ok(())
}
