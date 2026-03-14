//! Initialize config and RBAC for an existing Token-2022 mint.

use crate::{
    constants::{CONFIG_SEED, MINTER_ROLE_SEED},
    events::{CreationFinalized, Initialized},
    state::{MinterRole, StablecoinConfig},
};
use anchor_lang::{
    prelude::*,
    solana_program::program::invoke,
};
use anchor_spl::{
    token_2022::Token2022,
    token_interface::Mint as TokenMint,
};
use spl_token_2022::instruction::{self as token_2022_instruction, AuthorityType};

use super::initialize::{validate_preset, InitializeArgs};

pub fn handler(ctx: Context<InitializeExistingMint>, args: InitializeArgs) -> Result<()> {
    validate_preset(&args)?;

    let authority = ctx.accounts.authority.key();
    let mint = ctx.accounts.mint.key();
    let config_key = ctx.accounts.config.key();
    let now = Clock::get()?.unix_timestamp;

    {
        let config = &mut ctx.accounts.config;
        config.bump = ctx.bumps.config;
        config.mint = mint;
        config.preset = args.preset as u8;
        config.decimals = args.decimals;
        config.name = args.name.clone();
        config.symbol = args.symbol.clone();
        config.uri = args.uri.clone();
        config.master_authority = authority;
        config.pauser = args.roles.pauser.unwrap_or(authority);
        config.burner = args.roles.burner.unwrap_or(authority);
        config.blacklister = args.roles.blacklister.unwrap_or(authority);
        config.seizer = args.roles.seizer.unwrap_or(authority);
        config.treasury = args.roles.treasury;
        config.compliance_enabled = args.enable_compliance;
        config.paused = false;
        config.seize_requires_blacklist = args.seize_requires_blacklist;
        config.permanent_delegate_enabled = args.enable_permanent_delegate;
        config.transfer_hook_enabled = args.enable_transfer_hook;
        config.default_account_frozen = args.default_account_frozen;
        config.transfer_hook_program = args.transfer_hook_program;

        let minter = &mut ctx.accounts.master_minter_role;
        minter.bump = ctx.bumps.master_minter_role;
        minter.config = config_key;
        minter.authority = authority;
        minter.active = true;
        minter.quota_amount = args.initial_minter_quota;
        minter.window_seconds = args.initial_minter_window_seconds;
        minter.window_start_ts = now;
        minter.minted_in_window = 0;
    }

    rotate_mint_control(&ctx)?;

    emit!(Initialized {
        config: config_key,
        mint,
        master: authority,
        preset: args.preset as u8,
        compliance_enabled: args.enable_compliance,
        transfer_hook_enabled: args.enable_transfer_hook,
        permanent_delegate_enabled: args.enable_permanent_delegate,
    });
    emit!(CreationFinalized {
        mint,
        config: config_key,
        authority,
    });

    Ok(())
}

fn rotate_mint_control(ctx: &Context<InitializeExistingMint>) -> Result<()> {
    let token_program = ctx.accounts.token_program.key();
    let mint = ctx.accounts.mint.key();
    let authority = ctx.accounts.authority.key();
    let config = ctx.accounts.config.key();

    invoke(
        &token_2022_instruction::set_authority(
            &token_program,
            &mint,
            Some(&config),
            AuthorityType::MintTokens,
            &authority,
            &[],
        )?,
        &[
            ctx.accounts.mint.to_account_info(),
            ctx.accounts.authority.to_account_info(),
        ],
    )?;

    invoke(
        &token_2022_instruction::set_authority(
            &token_program,
            &mint,
            Some(&config),
            AuthorityType::FreezeAccount,
            &authority,
            &[],
        )?,
        &[
            ctx.accounts.mint.to_account_info(),
            ctx.accounts.authority.to_account_info(),
        ],
    )?;

    Ok(())
}

#[derive(Accounts)]
pub struct InitializeExistingMint<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    pub authority: Signer<'info>,

    #[account(
        init,
        payer = payer,
        space = 8 + StablecoinConfig::INIT_SPACE,
        seeds = [CONFIG_SEED, mint.key().as_ref()],
        bump
    )]
    pub config: Account<'info, StablecoinConfig>,

    #[account(
        init,
        payer = payer,
        space = 8 + MinterRole::INIT_SPACE,
        seeds = [MINTER_ROLE_SEED, config.key().as_ref(), authority.key().as_ref()],
        bump
    )]
    pub master_minter_role: Account<'info, MinterRole>,

    #[account(mut)]
    pub mint: InterfaceAccount<'info, TokenMint>,

    pub token_program: Program<'info, Token2022>,
    pub system_program: Program<'info, System>,
}
