use anchor_lang::prelude::*;
use crate::state::*;
use crate::errors::*;

#[derive(Accounts)]
#[instruction(minter: Pubkey)]
pub struct UpdateQuota<'info> {
    #[account(mut)]
    pub master_authority: Signer<'info>,

    #[account(
        has_one = master_authority @ StablecoinError::Unauthorized
    )]
    pub config: Account<'info, StablecoinConfig>,

    #[account(
        init_if_needed,
        payer = master_authority,
        space = MinterQuota::LEN,
        seeds = [b"quota", config.key().as_ref(), minter.as_ref()],
        bump
    )]
    pub quota: Account<'info, MinterQuota>,

    pub system_program: Program<'info, System>,
}

pub fn update_quota_handler(ctx: Context<UpdateQuota>, minter: Pubkey, limit: u64) -> Result<()> {
    let quota = &mut ctx.accounts.quota;
    quota.config = ctx.accounts.config.key();
    quota.minter = minter;
    quota.limit = limit;
    quota.bump = ctx.bumps.quota;
    Ok(())
}
