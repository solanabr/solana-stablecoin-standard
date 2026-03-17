use anchor_lang::prelude::*;
use anchor_lang::solana_program::instruction::{AccountMeta, Instruction};
use anchor_lang::solana_program::program::invoke;
use anchor_lang::solana_program::system_instruction;
use anchor_spl::token_2022::spl_token_2022;
use anchor_spl::token_2022::spl_token_2022::extension::default_account_state;
use anchor_spl::token_2022::spl_token_2022::extension::transfer_hook;
use anchor_spl::token_2022::spl_token_2022::extension::ExtensionType;
use anchor_spl::token_2022::spl_token_2022::state::{AccountState, Mint as SplMint};
use anchor_spl::token_2022::Token2022;

use sss_common::{validate_decimals, validate_metadata, SEED_CONFIG, SEED_ROLES};

use crate::errors::StablecoinError;
use crate::events::StablecoinInitialized;
use crate::state::{RoleConfig, StablecoinConfig};

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct InitializeParams {
    pub name: String,
    pub symbol: String,
    pub uri: String,
    pub decimals: u8,
    pub enable_permanent_delegate: bool,
    pub enable_transfer_hook: bool,
    pub default_account_frozen: bool,
}

#[event_cpi]
#[derive(Accounts)]
#[instruction(params: InitializeParams)]
pub struct Initialize<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(mut)]
    pub mint: Signer<'info>,
    #[account(
        init,
        payer = authority,
        space = 8 + StablecoinConfig::INIT_SPACE,
        seeds = [SEED_CONFIG, mint.key().as_ref()],
        bump
    )]
    pub config: Account<'info, StablecoinConfig>,
    #[account(
        init,
        payer = authority,
        space = 8 + RoleConfig::INIT_SPACE,
        seeds = [SEED_ROLES, mint.key().as_ref()],
        bump
    )]
    pub role_config: Account<'info, RoleConfig>,
    /// CHECK: Required only when transfer hook is enabled.
    #[account(mut)]
    pub extra_account_meta_list: Option<UncheckedAccount<'info>>,
    /// CHECK: Required only when transfer hook is enabled. Hook config PDA of the transfer-hook program.
    pub hook_config: Option<UncheckedAccount<'info>>,
    /// CHECK: Required only when transfer hook is enabled.
    pub transfer_hook_program: Option<UncheckedAccount<'info>>,
    pub token_program: Program<'info, Token2022>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

pub fn initialize_handler(ctx: Context<Initialize>, params: InitializeParams) -> Result<()> {
    validate_metadata(&params.name, &params.symbol, &params.uri)
        .map_err(|_| error!(StablecoinError::InvalidName))?;
    validate_decimals(params.decimals).map_err(|_| error!(StablecoinError::InvalidDecimals))?;

    require!(
        !params.enable_transfer_hook || params.enable_permanent_delegate,
        StablecoinError::InvalidPresetConfiguration
    );

    let hook_program = if params.enable_transfer_hook {
        Some(
            ctx.accounts
                .transfer_hook_program
                .as_ref()
                .ok_or(error!(StablecoinError::MissingTransferHookProgram))?,
        )
    } else {
        None
    };
    let extra_meta_list = if params.enable_transfer_hook {
        Some(
            ctx.accounts
                .extra_account_meta_list
                .as_ref()
                .ok_or(error!(StablecoinError::MissingExtraAccountMetaList))?,
        )
    } else {
        None
    };
    let hook_config = if params.enable_transfer_hook {
        Some(
            ctx.accounts
                .hook_config
                .as_ref()
                .ok_or(error!(StablecoinError::MissingExtraAccountMetaList))?,
        )
    } else {
        None
    };

    let mint_key = ctx.accounts.mint.key();
    let token_program_id = ctx.accounts.token_program.key();
    let config_key = ctx.accounts.config.key();

    let mut extensions = vec![ExtensionType::MintCloseAuthority];
    if params.enable_permanent_delegate {
        extensions.push(ExtensionType::PermanentDelegate);
    }
    if params.enable_transfer_hook {
        extensions.push(ExtensionType::TransferHook);
    }
    if params.default_account_frozen {
        extensions.push(ExtensionType::DefaultAccountState);
    }

    let mint_space = ExtensionType::try_calculate_account_len::<SplMint>(&extensions)?;
    let mint_lamports = ctx.accounts.rent.minimum_balance(mint_space);

    invoke(
        &system_instruction::create_account(
            &ctx.accounts.authority.key(),
            &mint_key,
            mint_lamports,
            mint_space as u64,
            &token_program_id,
        ),
        &[
            ctx.accounts.authority.to_account_info(),
            ctx.accounts.mint.to_account_info(),
            ctx.accounts.system_program.to_account_info(),
        ],
    )?;

    invoke(
        &spl_token_2022::instruction::initialize_mint_close_authority(
            &token_program_id,
            &mint_key,
            Some(&config_key),
        )?,
        &[ctx.accounts.mint.to_account_info()],
    )?;

    if params.enable_permanent_delegate {
        invoke(
            &spl_token_2022::instruction::initialize_permanent_delegate(
                &token_program_id,
                &mint_key,
                &config_key,
            )?,
            &[ctx.accounts.mint.to_account_info()],
        )?;
    }

    if let Some(transfer_hook_program) = hook_program {
        invoke(
            &transfer_hook::instruction::initialize(
                &token_program_id,
                &mint_key,
                Some(config_key),
                Some(transfer_hook_program.key()),
            )?,
            &[ctx.accounts.mint.to_account_info()],
        )?;
    }

    if params.default_account_frozen {
        invoke(
            &default_account_state::instruction::initialize_default_account_state(
                &token_program_id,
                &mint_key,
                &AccountState::Frozen,
            )?,
            &[ctx.accounts.mint.to_account_info()],
        )?;
    }

    invoke(
        &spl_token_2022::instruction::initialize_mint2(
            &token_program_id,
            &mint_key,
            &config_key,
            Some(&config_key),
            params.decimals,
        )?,
        &[ctx.accounts.mint.to_account_info()],
    )?;

    let now = Clock::get()?.unix_timestamp;
    let is_sss2 = params.enable_permanent_delegate && params.enable_transfer_hook;

    let config = &mut ctx.accounts.config;
    config.mint = mint_key;
    config.authority = ctx.accounts.authority.key();
    config.name = params.name;
    config.symbol = params.symbol;
    config.uri = params.uri;
    config.decimals = params.decimals;
    config.enable_permanent_delegate = params.enable_permanent_delegate;
    config.enable_transfer_hook = params.enable_transfer_hook;
    config.default_account_frozen = params.default_account_frozen;
    config.paused = false;
    config.total_minted = 0;
    config.total_burned = 0;
    config.created_at = now;
    config.last_changed_by = ctx.accounts.authority.key();
    config.last_changed_at = now;
    config.bump = ctx.bumps.config;

    let role_config = &mut ctx.accounts.role_config;
    role_config.mint = mint_key;
    role_config.master_authority = ctx.accounts.authority.key();
    role_config.pauser = ctx.accounts.authority.key();
    role_config.burner = ctx.accounts.authority.key();
    role_config.blacklister = if is_sss2 {
        ctx.accounts.authority.key()
    } else {
        Pubkey::default()
    };
    role_config.seizer = if is_sss2 {
        ctx.accounts.authority.key()
    } else {
        Pubkey::default()
    };
    role_config.bump = ctx.bumps.role_config;

    if let (Some(transfer_hook_program), Some(extra_account_meta_list), Some(hook_config)) =
        (hook_program, extra_meta_list, hook_config)
    {
        invoke(
            &Instruction {
                program_id: transfer_hook_program.key(),
                accounts: vec![
                    AccountMeta::new(ctx.accounts.authority.key(), true),
                    AccountMeta::new_readonly(hook_config.key(), false),
                    AccountMeta::new(extra_account_meta_list.key(), false),
                    AccountMeta::new_readonly(ctx.accounts.mint.key(), false),
                    AccountMeta::new_readonly(ctx.accounts.system_program.key(), false),
                ],
                data: INITIALIZE_EXTRA_ACCOUNT_META_LIST_DISCRIMINATOR.to_vec(),
            },
            &[
                ctx.accounts.authority.to_account_info(),
                hook_config.to_account_info(),
                extra_account_meta_list.to_account_info(),
                ctx.accounts.mint.to_account_info(),
                ctx.accounts.system_program.to_account_info(),
            ],
        )?;
    }

    emit_cpi!(StablecoinInitialized {
        mint: mint_key,
        authority: ctx.accounts.authority.key(),
        preset: if is_sss2 {
            "SSS-2".to_string()
        } else {
            "SSS-1".to_string()
        },
    });

    Ok(())
}

const INITIALIZE_EXTRA_ACCOUNT_META_LIST_DISCRIMINATOR: [u8; 8] =
    [43, 34, 13, 49, 167, 88, 235, 235];
