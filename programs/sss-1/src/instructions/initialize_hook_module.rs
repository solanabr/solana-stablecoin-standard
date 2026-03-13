use anchor_lang::prelude::*;

use crate::{constants::HOOK_CONFIG_SEED, events::HookInitialized, state::HookConfig};

#[derive(Accounts)]
pub struct InitializeHookModule<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        init,
        payer = authority,
        space = HookConfig::LEN,
        seeds = [HOOK_CONFIG_SEED, mint.key().as_ref()],
        bump,
    )]
    pub hook_config: Account<'info, HookConfig>,

    /// CHECK: The mint this hook is associated with
    pub mint: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<InitializeHookModule>) -> Result<()> {
    let hook_config = &mut ctx.accounts.hook_config;
    hook_config.authority = ctx.accounts.authority.key();
    hook_config.mint = ctx.accounts.mint.key();
    hook_config.compliance_enabled = true;
    hook_config.bump = ctx.bumps.hook_config;
    hook_config._reserved = [0u8; 64];

    emit!(HookInitialized {
        hook_config: hook_config.key(),
        authority: hook_config.authority,
        mint: hook_config.mint,
    });

    Ok(())
}
