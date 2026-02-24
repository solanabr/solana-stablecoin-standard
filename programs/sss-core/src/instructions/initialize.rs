use anchor_lang::prelude::*;
use anchor_spl::token_interface::{Mint, TokenInterface};

use crate::constants::*;
use crate::error::SssError;
use crate::events::StablecoinInitialized;
use crate::state::{Role, RoleAccount, StablecoinConfig};

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct InitializeArgs {
    pub preset: u8,
    pub name: String,
    pub symbol: String,
    pub uri: String,
    pub decimals: u8,
    pub supply_cap: Option<u64>,
}

#[derive(Accounts)]
#[instruction(args: InitializeArgs)]
pub struct Initialize<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        init,
        payer = authority,
        space = CONFIG_SPACE,
        seeds = [SSS_CONFIG_SEED, mint.key().as_ref()],
        bump,
    )]
    pub config: Account<'info, StablecoinConfig>,

    /// The Token-2022 mint, created externally by the SDK before this instruction.
    pub mint: InterfaceAccount<'info, Mint>,

    #[account(
        init,
        payer = authority,
        space = ROLE_SPACE,
        seeds = [
            SSS_ROLE_SEED,
            config.key().as_ref(),
            authority.key().as_ref(),
            &[Role::Admin.as_u8()],
        ],
        bump,
    )]
    pub admin_role: Account<'info, RoleAccount>,

    pub token_program: Interface<'info, TokenInterface>,
    pub system_program: Program<'info, System>,
}

pub fn handler_initialize(ctx: Context<Initialize>, args: InitializeArgs) -> Result<()> {
    require!(
        args.preset >= 1 && args.preset <= 3,
        SssError::InvalidPreset
    );

    let config = &mut ctx.accounts.config;
    config.authority = ctx.accounts.authority.key();
    config.mint = ctx.accounts.mint.key();
    config.preset = args.preset;
    config.paused = false;
    config.supply_cap = args.supply_cap;
    config.total_minted = 0;
    config.total_burned = 0;
    config.bump = ctx.bumps.config;
    config._reserved = [0u8; 64];

    let admin_role = &mut ctx.accounts.admin_role;
    admin_role.config = config.key();
    admin_role.address = ctx.accounts.authority.key();
    admin_role.role = Role::Admin;
    admin_role.granted_by = ctx.accounts.authority.key();
    admin_role.granted_at = Clock::get()?.unix_timestamp;
    admin_role.bump = ctx.bumps.admin_role;

    emit!(StablecoinInitialized {
        mint: config.mint,
        authority: config.authority,
        preset: config.preset,
        supply_cap: config.supply_cap,
    });

    Ok(())
}
