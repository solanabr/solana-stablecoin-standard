use anchor_lang::prelude::*;
use anchor_spl::{
    token_2022::{self, Burn, Token2022},
    token_interface::Mint,
};

use crate::error::SssError;
use crate::events::TokensBurned;
use crate::state::{RoleAccount, Role, StablecoinConfig};

#[derive(Accounts)]
pub struct BurnFrom<'info> {
    pub burner: Signer<'info>,

    #[account(
        mut,
        seeds = [b"sss_config", config.mint.as_ref()],
        bump = config.bump,
        has_one = mint,
    )]
    pub config: Account<'info, StablecoinConfig>,

    #[account(
        seeds = [
            b"sss_role",
            config.key().as_ref(),
            burner.key().as_ref(),
            &[Role::Burner.discriminant()],
        ],
        bump = role_account.bump,
        constraint = role_account.role == Role::Burner @ SssError::Unauthorized,
    )]
    pub role_account: Account<'info, RoleAccount>,

    #[account(mut)]
    pub mint: InterfaceAccount<'info, Mint>,

    /// CHECK: Token account to burn from, validated by token program CPI
    #[account(mut)]
    pub from: UncheckedAccount<'info>,

    pub token_program: Program<'info, Token2022>,
}

pub fn handler(ctx: Context<BurnFrom>, amount: u64) -> Result<()> {
    require!(amount > 0, SssError::ZeroAmount);
    require!(!ctx.accounts.config.paused, SssError::Paused);
    // burn_from uses permanent delegate — only available on SSS-2/SSS-3
    require!(ctx.accounts.config.preset.has_compliance_features(), SssError::PresetFeatureUnavailable);

    let config = &ctx.accounts.config;
    let cs = crate::utils::ConfigSeeds::new(config);
    let seeds = cs.as_seeds();
    let signer_seeds: &[&[&[u8]]] = &[&seeds];

    // For SSS-2/SSS-3 (DefaultAccountState::Frozen), thaw before burning if frozen
    let mut was_frozen = false;
    if config.preset.has_compliance_features() {
        was_frozen = crate::utils::thaw_if_frozen(
            &ctx.accounts.from.to_account_info(),
            &ctx.accounts.mint,
            &ctx.accounts.config.to_account_info(),
            &ctx.accounts.token_program,
            signer_seeds,
        )?;
    }

    // Use config PDA as permanent delegate to burn from any account
    token_2022::burn(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            Burn {
                mint: ctx.accounts.mint.to_account_info(),
                from: ctx.accounts.from.to_account_info(),
                authority: ctx.accounts.config.to_account_info(),
            },
            signer_seeds,
        ),
        amount,
    )?;

    // Re-freeze only if account was frozen before burn (preserve original state)
    crate::utils::refreeze_if_was_frozen(
        was_frozen,
        &ctx.accounts.from.to_account_info(),
        &ctx.accounts.mint,
        &ctx.accounts.config.to_account_info(),
        &ctx.accounts.token_program,
        signer_seeds,
    )?;

    let config = &mut ctx.accounts.config;
    config.total_burned = config
        .total_burned
        .checked_add(amount)
        .ok_or(SssError::Overflow)?;

    emit!(TokensBurned {
        config: config.key(),
        mint: config.mint,
        from: ctx.accounts.from.key(),
        amount,
        burner: ctx.accounts.burner.key(),
    });

    Ok(())
}
