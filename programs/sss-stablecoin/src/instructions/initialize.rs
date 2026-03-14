//! Initialize instruction for creating a new stablecoin

use crate::{
    constants::{CONFIG_SEED, MINTER_ROLE_SEED},
    error::StablecoinError,
    events::Initialized,
    state::{MinterRole, StablecoinConfig},
};
use anchor_lang::{
    prelude::*,
    solana_program::{
        program::invoke,
        system_instruction,
    },
};
use anchor_spl::token_2022::Token2022;
use spl_token_2022::{
    extension::{
        default_account_state::instruction as default_account_state_instruction,
        metadata_pointer::instruction as metadata_pointer_instruction,
        transfer_hook::instruction as transfer_hook_instruction, ExtensionType,
    },
    instruction as token_2022_instruction,
    state::AccountState,
};

/// Initialize a new stablecoin with specified configuration
pub fn handler(ctx: Context<Initialize>, args: InitializeArgs) -> Result<()> {
    validate_preset(&args)?;
    create_token_2022_mint(&ctx, &args)?;

    let config = &mut ctx.accounts.config;
    config.bump = ctx.bumps.config;
    config.mint = ctx.accounts.mint.key();
    config.preset = args.preset as u8;
    config.decimals = args.decimals;
    config.name = args.name.clone();
    config.symbol = args.symbol.clone();
    config.uri = args.uri.clone();
    config.master_authority = ctx.accounts.authority.key();
    config.pauser = args.roles.pauser.unwrap_or(ctx.accounts.authority.key());
    config.burner = args.roles.burner.unwrap_or(ctx.accounts.authority.key());
    config.blacklister = args
        .roles
        .blacklister
        .unwrap_or(ctx.accounts.authority.key());
    config.seizer = args.roles.seizer.unwrap_or(ctx.accounts.authority.key());
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
    minter.config = config.key();
    minter.authority = ctx.accounts.authority.key();
    minter.active = true;
    minter.quota_amount = args.initial_minter_quota;
    minter.window_seconds = args.initial_minter_window_seconds;
    minter.window_start_ts = Clock::get()?.unix_timestamp;
    minter.minted_in_window = 0;

    emit!(Initialized {
        config: config.key(),
        mint: config.mint,
        master: config.master_authority,
        preset: config.preset,
        compliance_enabled: config.compliance_enabled,
        transfer_hook_enabled: config.transfer_hook_enabled,
        permanent_delegate_enabled: config.permanent_delegate_enabled,
    });

    Ok(())
}

pub(crate) fn validate_preset(args: &InitializeArgs) -> Result<()> {
    match args.preset {
        Preset::Sss1 => {
            require!(
                !args.enable_compliance,
                StablecoinError::InvalidPresetConfiguration
            );
            require!(
                !args.enable_permanent_delegate,
                StablecoinError::InvalidPresetConfiguration
            );
            require!(
                !args.enable_transfer_hook,
                StablecoinError::InvalidPresetConfiguration
            );
        }
        Preset::Sss2 => {
            require!(
                args.enable_compliance,
                StablecoinError::InvalidPresetConfiguration
            );
            require!(
                args.enable_permanent_delegate,
                StablecoinError::InvalidPresetConfiguration
            );
            require!(
                args.enable_transfer_hook,
                StablecoinError::InvalidPresetConfiguration
            );
        }
    }

    require!(args.initial_minter_quota > 0, StablecoinError::InvalidQuota);
    require!(
        args.initial_minter_window_seconds > 0,
        StablecoinError::InvalidQuota
    );
    Ok(())
}

fn create_token_2022_mint(ctx: &Context<Initialize>, args: &InitializeArgs) -> Result<()> {
    let mint_key = ctx.accounts.mint.key();
    let config_key = ctx.accounts.config.key();

    let mut extensions = vec![ExtensionType::MetadataPointer];
    if args.enable_permanent_delegate {
        extensions.push(ExtensionType::PermanentDelegate);
    }
    if args.enable_transfer_hook {
        extensions.push(ExtensionType::TransferHook);
    }
    if args.default_account_frozen {
        extensions.push(ExtensionType::DefaultAccountState);
    }

    let mint_len =
        ExtensionType::try_calculate_account_len::<spl_token_2022::state::Mint>(&extensions)
            .map_err(|_| error!(StablecoinError::MintSizingFailed))?;
    let required_lamports = Rent::get()?.minimum_balance(mint_len);

    invoke(
        &system_instruction::create_account(
            &ctx.accounts.payer.key(),
            &mint_key,
            required_lamports,
            mint_len as u64,
            &ctx.accounts.token_program.key(),
        ),
        &[
            ctx.accounts.payer.to_account_info(),
            ctx.accounts.mint.to_account_info(),
            ctx.accounts.system_program.to_account_info(),
        ],
    )?;

    invoke(
        &metadata_pointer_instruction::initialize(
            &ctx.accounts.token_program.key(),
            &mint_key,
            Some(ctx.accounts.authority.key()),
            Some(config_key),
        )?,
        &[ctx.accounts.mint.to_account_info()],
    )?;

    if args.enable_permanent_delegate {
        invoke(
            &token_2022_instruction::initialize_permanent_delegate(
                &ctx.accounts.token_program.key(),
                &mint_key,
                &config_key,
            )?,
            &[ctx.accounts.mint.to_account_info()],
        )?;
    }

    if args.enable_transfer_hook {
        invoke(
            &transfer_hook_instruction::initialize(
                &ctx.accounts.token_program.key(),
                &mint_key,
                Some(config_key),
                Some(args.transfer_hook_program),
            )?,
            &[ctx.accounts.mint.to_account_info()],
        )?;
    }

    if args.default_account_frozen {
        invoke(
            &default_account_state_instruction::initialize_default_account_state(
                &ctx.accounts.token_program.key(),
                &mint_key,
                &AccountState::Frozen,
            )?,
            &[ctx.accounts.mint.to_account_info()],
        )?;
    }

    invoke(
        &token_2022_instruction::initialize_mint2(
            &ctx.accounts.token_program.key(),
            &mint_key,
            &ctx.accounts.authority.key(),
            Some(&ctx.accounts.authority.key()),
            args.decimals,
        )?,
        &[ctx.accounts.mint.to_account_info()],
    )?;

    Ok(())
}

#[derive(Accounts)]
pub struct Initialize<'info> {
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

    /// CHECK: mint keypair signs so the program can create and initialize a Token-2022 mint.
    #[account(mut)]
    pub mint: Signer<'info>,

    pub token_program: Program<'info, Token2022>,
    pub system_program: Program<'info, System>,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct InitializeArgs {
    pub name: String,
    pub symbol: String,
    pub uri: String,
    pub decimals: u8,
    pub preset: Preset,
    pub enable_compliance: bool,
    pub enable_permanent_delegate: bool,
    pub enable_transfer_hook: bool,
    pub default_account_frozen: bool,
    pub seize_requires_blacklist: bool,
    pub transfer_hook_program: Pubkey,
    pub roles: RoleConfiguration,
    pub initial_minter_quota: u64,
    pub initial_minter_window_seconds: i64,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct RoleConfiguration {
    pub pauser: Option<Pubkey>,
    pub burner: Option<Pubkey>,
    pub blacklister: Option<Pubkey>,
    pub seizer: Option<Pubkey>,
    pub treasury: Pubkey,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq)]
#[repr(u8)]
pub enum Preset {
    Sss1 = 1,
    Sss2 = 2,
}

#[cfg(test)]
mod tests {
    use super::*;

    fn test_args(preset: Preset) -> InitializeArgs {
        InitializeArgs {
            name: "USD".to_string(),
            symbol: "USD".to_string(),
            uri: "https://example.org".to_string(),
            decimals: 6,
            preset,
            enable_compliance: preset == Preset::Sss2,
            enable_permanent_delegate: preset == Preset::Sss2,
            enable_transfer_hook: preset == Preset::Sss2,
            default_account_frozen: false,
            seize_requires_blacklist: true,
            transfer_hook_program: Pubkey::default(),
            roles: RoleConfiguration {
                pauser: None,
                burner: None,
                blacklister: None,
                seizer: None,
                treasury: Pubkey::default(),
            },
            initial_minter_quota: 100,
            initial_minter_window_seconds: 60,
        }
    }

    #[test]
    fn preset_validation_accepts_valid_inputs() {
        assert!(validate_preset(&test_args(Preset::Sss1)).is_ok());
        assert!(validate_preset(&test_args(Preset::Sss2)).is_ok());
    }

    #[test]
    fn sss1_rejects_compliance_extensions() {
        let mut args = test_args(Preset::Sss1);
        args.enable_compliance = true;
        assert!(validate_preset(&args).is_err());
    }

    #[test]
    fn sss2_requires_compliance_extensions() {
        let mut args = test_args(Preset::Sss2);
        args.enable_compliance = false;
        assert!(validate_preset(&args).is_err());
    }
}
