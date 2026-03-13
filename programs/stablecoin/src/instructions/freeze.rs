use anchor_lang::prelude::*;
use anchor_spl::token_interface::{
    self,
    FreezeAccount as FreezeAccountCpi,
    ThawAccount as ThawAccountCpi,
    TokenInterface,
};

use crate::instructions::auth::{config_signer_seeds, require_operator_role};
use crate::instructions::token_accounts::{load_mint, load_token_account};
use crate::errors::StablecoinError;
use crate::state::{RoleAssignment, RoleType, StablecoinConfig};

#[derive(Accounts)]
pub struct FreezeAccount<'info> {
    #[account(mut)]
    pub config: Account<'info, StablecoinConfig>,
    #[account(mut)]
    pub mint: UncheckedAccount<'info>,
    #[account(mut)]
    pub token_account: UncheckedAccount<'info>,
    pub operator: Signer<'info>,
    pub token_program: Interface<'info, TokenInterface>,
    pub role_assignment: Option<Account<'info, RoleAssignment>>,
}

#[derive(Accounts)]
pub struct ThawAccount<'info> {
    #[account(mut)]
    pub config: Account<'info, StablecoinConfig>,
    #[account(mut)]
    pub mint: UncheckedAccount<'info>,
    #[account(mut)]
    pub token_account: UncheckedAccount<'info>,
    pub operator: Signer<'info>,
    pub token_program: Interface<'info, TokenInterface>,
    pub role_assignment: Option<Account<'info, RoleAssignment>>,
}

pub fn freeze_handler(ctx: Context<FreezeAccount>) -> Result<()> {
    require!(!ctx.accounts.config.is_paused, StablecoinError::Paused);
    require_keys_eq!(ctx.accounts.config.mint, ctx.accounts.mint.key(), StablecoinError::InvalidMint);
    let token_program = ctx.accounts.token_program.key();
    let token_account = load_token_account(&ctx.accounts.token_account, &token_program)?;
    load_mint(&ctx.accounts.mint, &token_program)?;
    require_keys_eq!(token_account.mint, ctx.accounts.mint.key(), StablecoinError::InvalidMint);
    require_operator_role(
        ctx.program_id,
        &ctx.accounts.config,
        &ctx.accounts.operator.key(),
        ctx.accounts.role_assignment.as_ref(),
        RoleType::Pauser,
    )?;
    let signer_seeds = config_signer_seeds(&ctx.accounts.config.mint, &ctx.accounts.config.bump);
    token_interface::freeze_account(CpiContext::new(
        ctx.accounts.token_program.to_account_info(),
        FreezeAccountCpi {
            account: ctx.accounts.token_account.to_account_info(),
            mint: ctx.accounts.mint.to_account_info(),
            authority: ctx.accounts.config.to_account_info(),
        },
    )
    .with_signer(&[&signer_seeds]))?;
    Ok(())
}

pub fn thaw_handler(ctx: Context<ThawAccount>) -> Result<()> {
    require!(!ctx.accounts.config.is_paused, StablecoinError::Paused);
    require_keys_eq!(ctx.accounts.config.mint, ctx.accounts.mint.key(), StablecoinError::InvalidMint);
    let token_program = ctx.accounts.token_program.key();
    let token_account = load_token_account(&ctx.accounts.token_account, &token_program)?;
    load_mint(&ctx.accounts.mint, &token_program)?;
    require_keys_eq!(token_account.mint, ctx.accounts.mint.key(), StablecoinError::InvalidMint);
    require_operator_role(
        ctx.program_id,
        &ctx.accounts.config,
        &ctx.accounts.operator.key(),
        ctx.accounts.role_assignment.as_ref(),
        RoleType::Pauser,
    )?;
    let signer_seeds = config_signer_seeds(&ctx.accounts.config.mint, &ctx.accounts.config.bump);
    token_interface::thaw_account(CpiContext::new(
        ctx.accounts.token_program.to_account_info(),
        ThawAccountCpi {
            account: ctx.accounts.token_account.to_account_info(),
            mint: ctx.accounts.mint.to_account_info(),
            authority: ctx.accounts.config.to_account_info(),
        },
    )
    .with_signer(&[&signer_seeds]))?;
    Ok(())
}
