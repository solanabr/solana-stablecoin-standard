use anchor_lang::prelude::*;
use crate::state::HookConfig;

#[derive(Accounts)]
pub struct InitializeHookConfig<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    /// The authority that will manage blacklists (sss-core config PDA signs via CPI)
    pub authority: Signer<'info>,

    /// CHECK: The mint this hook config is for
    pub mint: UncheckedAccount<'info>,

    #[account(
        init,
        payer = payer,
        space = HookConfig::LEN,
        seeds = [b"hook_config", mint.key().as_ref()],
        bump,
    )]
    pub hook_config: Account<'info, HookConfig>,

    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<InitializeHookConfig>) -> Result<()> {
    let config = &mut ctx.accounts.hook_config;
    config.authority = ctx.accounts.authority.key();
    config.mint = ctx.accounts.mint.key();
    config.bump = ctx.bumps.hook_config;
    Ok(())
}
