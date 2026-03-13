use anchor_lang::prelude::*;
use anchor_spl::token_2022::spl_token_2022::onchain::invoke_transfer_checked;
use anchor_spl::token_interface::TokenInterface;

use crate::instructions::auth::{config_signer_seeds, require_operator_role};
use crate::instructions::token_accounts::{load_mint, load_token_account};
use crate::errors::StablecoinError;
use crate::events::TokensSeized;
use crate::state::{RoleAssignment, RoleType, StablecoinConfig};

#[derive(Accounts)]
pub struct SeizeTokens<'info> {
    #[account(mut)]
    pub config: Account<'info, StablecoinConfig>,
    pub operator: Signer<'info>,
    #[account(mut)]
    pub mint: UncheckedAccount<'info>,
    #[account(mut)]
    pub from_account: UncheckedAccount<'info>,
    #[account(mut)]
    pub to_account: UncheckedAccount<'info>,
    pub token_program: Interface<'info, TokenInterface>,
    pub role_assignment: Option<Account<'info, RoleAssignment>>,
}

pub fn handler<'info>(ctx: Context<'_, '_, '_, 'info, SeizeTokens<'info>>) -> Result<()> {
    require_operator_role(
        ctx.program_id,
        &ctx.accounts.config,
        &ctx.accounts.operator.key(),
        ctx.accounts.role_assignment.as_ref(),
        RoleType::Seizer,
    )?;
    require!(
        ctx.accounts.config.enable_permanent_delegate,
        StablecoinError::ComplianceNotEnabled
    );
    let token_program = ctx.accounts.token_program.key();
    let mint = load_mint(&ctx.accounts.mint, &token_program)?;
    let from_account = load_token_account(&ctx.accounts.from_account, &token_program)?;
    let to_account = load_token_account(&ctx.accounts.to_account, &token_program)?;
    require_keys_eq!(
        from_account.mint,
        ctx.accounts.mint.key(),
        StablecoinError::InvalidMint
    );
    require_keys_eq!(
        to_account.mint,
        ctx.accounts.mint.key(),
        StablecoinError::InvalidMint
    );

    let amount = from_account.amount;
    if amount > 0 {
        let signer_seeds =
            config_signer_seeds(&ctx.accounts.config.mint, &ctx.accounts.config.bump);
        invoke_transfer_checked(
            &ctx.accounts.token_program.key(),
            ctx.accounts.from_account.to_account_info(),
            ctx.accounts.mint.to_account_info(),
            ctx.accounts.to_account.to_account_info(),
            ctx.accounts.config.to_account_info(),
            ctx.remaining_accounts,
            amount,
            mint.decimals,
            &[&signer_seeds],
        )?;
    }

    emit!(TokensSeized {
        mint: ctx.accounts.config.mint,
        from_account: ctx.accounts.from_account.key(),
        to_account: ctx.accounts.to_account.key(),
        authority: ctx.accounts.operator.key(),
    });
    Ok(())
}
