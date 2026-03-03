use anchor_lang::prelude::*;
use anchor_spl::token_2022::{self, FreezeAccount, Token2022};
use anchor_spl::token_interface::Mint;

use crate::error::SssError;
use crate::events::AccountFrozenEvent;
use crate::state::{Role, RoleAccount, StablecoinConfig};

#[derive(Accounts)]
pub struct FreezeTokenAccount<'info> {
    pub authority: Signer<'info>,

    #[account(
        seeds = [b"sss_config", config.mint.as_ref()],
        bump = config.bump,
        has_one = mint,
    )]
    pub config: Account<'info, StablecoinConfig>,

    #[account(
        seeds = [
            b"sss_role",
            config.key().as_ref(),
            authority.key().as_ref(),
            &[Role::ComplianceOfficer.discriminant()],
        ],
        bump = role_account.bump,
        constraint = role_account.role == Role::ComplianceOfficer @ SssError::Unauthorized,
    )]
    pub role_account: Option<Account<'info, RoleAccount>>,

    #[account(mut)]
    pub mint: InterfaceAccount<'info, Mint>,

    /// CHECK: Token account to freeze, validated by token program CPI
    #[account(mut)]
    pub token_account: UncheckedAccount<'info>,

    pub token_program: Program<'info, Token2022>,
}

pub fn handler(ctx: Context<FreezeTokenAccount>) -> Result<()> {
    // Note: freeze/thaw are exempt from pause checks — compliance must operate during emergencies
    let config = &ctx.accounts.config;
    // freeze_account uses freeze authority — only available on SSS-2/SSS-3
    require!(config.preset.has_compliance_features(), SssError::PresetFeatureUnavailable);

    // Authority must be admin or ComplianceOfficer
    let is_admin = ctx.accounts.authority.key() == config.admin;
    let is_compliance = ctx.accounts.role_account.is_some();
    require!(is_admin || is_compliance, SssError::Unauthorized);

    let cs = crate::utils::ConfigSeeds::new(config);
    let seeds = cs.as_seeds();
    let signer_seeds: &[&[&[u8]]] = &[&seeds];

    token_2022::freeze_account(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            FreezeAccount {
                account: ctx.accounts.token_account.to_account_info(),
                mint: ctx.accounts.mint.to_account_info(),
                authority: ctx.accounts.config.to_account_info(),
            },
            signer_seeds,
        ),
    )?;

    emit!(AccountFrozenEvent {
        config: ctx.accounts.config.key(),
        account: ctx.accounts.token_account.key(),
        frozen_by: ctx.accounts.authority.key(),
    });

    Ok(())
}
