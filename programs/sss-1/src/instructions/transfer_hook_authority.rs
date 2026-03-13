use anchor_lang::prelude::*;

use crate::{
    constants::HOOK_CONFIG_SEED, error::StablecoinError, events::HookAuthorityTransferred,
    state::HookConfig,
};

#[derive(Accounts)]
pub struct TransferHookAuthority<'info> {
    pub authority: Signer<'info>,

    #[account(
        mut,
        seeds = [HOOK_CONFIG_SEED, hook_config.mint.as_ref()],
        bump = hook_config.bump,
        constraint = hook_config.authority == authority.key() @ StablecoinError::Unauthorized,
    )]
    pub hook_config: Account<'info, HookConfig>,

    /// CHECK: New authority can be any valid address
    pub new_authority: UncheckedAccount<'info>,
}

pub fn handler(ctx: Context<TransferHookAuthority>) -> Result<()> {
    let hook_config = &mut ctx.accounts.hook_config;
    let previous_authority = hook_config.authority;
    let new_authority = ctx.accounts.new_authority.key();
    require!(
        new_authority != Pubkey::default(),
        StablecoinError::InvalidNewAuthority
    );
    require!(
        new_authority != previous_authority,
        StablecoinError::AuthorityUnchanged
    );
    hook_config.authority = new_authority;

    emit!(HookAuthorityTransferred {
        hook_config: hook_config.key(),
        previous_authority,
        new_authority,
    });

    Ok(())
}
