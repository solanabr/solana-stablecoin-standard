use anchor_lang::prelude::*;
use crate::{
    constants::*,
    error::SssError,
    events::MinterUpdated,
    state::{MinterInfo, StablecoinConfig},
};

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct UpdateMinterParams {
    /// Minter address to add/update
    pub minter: Pubkey,
    /// Max tokens minter can issue (0 = unlimited)
    pub quota: u64,
    pub active: bool,
}

#[derive(Accounts)]
#[instruction(params: UpdateMinterParams)]
pub struct UpdateMinter<'info> {
    #[account(
        mut,
        constraint = config.authority == authority.key() @ SssError::Unauthorized,
    )]
    pub authority: Signer<'info>,

    #[account(
        seeds = [CONFIG_SEED, config.mint.as_ref()],
        bump = config.bump,
    )]
    pub config: Account<'info, StablecoinConfig>,

    #[account(
        init_if_needed,
        payer = authority,
        space = MinterInfo::SPACE,
        seeds = [MINTER_SEED, config.mint.as_ref(), params.minter.as_ref()],
        bump,
    )]
    pub minter_info: Account<'info, MinterInfo>,

    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<UpdateMinter>, params: UpdateMinterParams) -> Result<()> {
    let minter_info = &mut ctx.accounts.minter_info;
    let config = &ctx.accounts.config;

    minter_info.mint = config.mint;
    minter_info.minter = params.minter;
    minter_info.quota = params.quota;
    minter_info.active = params.active;

    // Reset minted counter only when creating fresh entry
    if minter_info.minted == 0 {
        minter_info.minted = 0;
    }
    minter_info.bump = ctx.bumps.minter_info;

    emit!(MinterUpdated {
        mint: config.mint,
        minter: params.minter,
        quota: params.quota,
        active: params.active,
    });

    Ok(())
}
