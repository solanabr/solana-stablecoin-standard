use anchor_lang::prelude::*;
use anchor_spl::token_interface::{Mint, TokenInterface};
use spl_token_2022::extension::ExtensionType;
use spl_token_2022::instruction as t22_ix;
use spl_token_2022::state::Mint as T22Mint;

use crate::errors::SssError;
use crate::state::*;

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct InitializeParams {
    /// 1 = SSS-1, 2 = SSS-2
    pub preset: u8,
    pub name: String,
    pub symbol: String,
    pub uri: String,
    pub decimals: u8,
    /// 0 = no cap
    pub supply_cap: u64,
    /// Required for SSS-2: the deployed transfer hook program
    pub transfer_hook_program: Option<Pubkey>,
}

#[derive(Accounts)]
#[instruction(params: InitializeParams)]
pub struct Initialize<'info> {
    #[account(mut)]
    pub deployer: Signer<'info>,

    /// Token-2022 mint. We create it via CPI so it gets the right extensions.
    /// CHECK: Created in instruction body with proper extension setup
    #[account(mut)]
    pub mint: Signer<'info>,

    #[account(
        init,
        payer = deployer,
        space = TokenConfig::LEN,
        seeds = [b"sss_config", mint.key().as_ref()],
        bump,
    )]
    pub config: Account<'info, TokenConfig>,

    /// Admin role for the deployer — created automatically
    #[account(
        init,
        payer = deployer,
        space = RoleAccount::LEN,
        seeds = [b"sss_role", config.key().as_ref(), deployer.key().as_ref()],
        bump,
    )]
    pub deployer_role: Account<'info, RoleAccount>,

    /// Only initialized for SSS-2. Passed as optional — if preset == 1 this is ignored.
    /// CHECK: We init this manually for SSS-2
    #[account(mut)]
    pub blacklist: Option<UncheckedAccount<'info>>,

    pub token_program: Interface<'info, TokenInterface>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

pub fn handler(ctx: Context<Initialize>, params: InitializeParams) -> Result<()> {
    require!(params.name.len() <= 32, SssError::NameTooLong);
    require!(params.symbol.len() <= 10, SssError::SymbolTooLong);
    require!(params.uri.len() <= 200, SssError::UriTooLong);

    let preset = match params.preset {
        1 => Preset::Sss1,
        2 => Preset::Sss2,
        _ => return err!(SssError::InvalidPreset),
    };

    // For SSS-2, transfer hook program is mandatory
    let hook_program = if preset.is_compliant() {
        params
            .transfer_hook_program
            .ok_or(SssError::PresetMismatch)?
    } else {
        Pubkey::default()
    };

    // --- Create Token-2022 mint with extensions ---
    // Figure out which extensions we need based on preset
    let mut extensions = vec![
        ExtensionType::MintCloseAuthority,
        ExtensionType::MetadataPointer,
    ];
    if preset.is_compliant() {
        extensions.push(ExtensionType::PermanentDelegate);
        extensions.push(ExtensionType::TransferHook);
    }

    let mint_space = ExtensionType::try_calculate_account_len::<T22Mint>(&extensions)
        .map_err(|_| SssError::Overflow)?;
    let mint_rent = Rent::get()?.minimum_balance(mint_space);

    // Allocate the mint account
    anchor_lang::system_program::create_account(
        CpiContext::new(
            ctx.accounts.system_program.to_account_info(),
            anchor_lang::system_program::CreateAccount {
                from: ctx.accounts.deployer.to_account_info(),
                to: ctx.accounts.mint.to_account_info(),
            },
        ),
        mint_rent,
        mint_space as u64,
        ctx.accounts.token_program.key,
    )?;

    // Config PDA is the mint authority and freeze authority
    let config_key = ctx.accounts.config.key();
    let mint_key = ctx.accounts.mint.key();

    // Initialize extensions before initializing the mint itself
    // MintCloseAuthority — lets us close the mint if supply reaches 0
    anchor_lang::solana_program::program::invoke(
        &t22_ix::initialize_mint_close_authority(
            ctx.accounts.token_program.key,
            &mint_key,
            Some(&config_key),
        )?,
        &[ctx.accounts.mint.to_account_info()],
    )?;

    // MetadataPointer — self-referencing so metadata lives on the mint itself
    anchor_lang::solana_program::program::invoke(
        &spl_token_2022::extension::metadata_pointer::instruction::initialize(
            ctx.accounts.token_program.key,
            &mint_key,
            Some(config_key),
            Some(mint_key),
        )?,
        &[ctx.accounts.mint.to_account_info()],
    )?;

    if preset.is_compliant() {
        // PermanentDelegate — config PDA can transfer/burn from any account (for seizure)
        anchor_lang::solana_program::program::invoke(
            &t22_ix::initialize_permanent_delegate(
                ctx.accounts.token_program.key,
                &mint_key,
                &config_key,
            )?,
            &[ctx.accounts.mint.to_account_info()],
        )?;

        // TransferHook — every transfer goes through our compliance hook
        anchor_lang::solana_program::program::invoke(
            &spl_transfer_hook_interface::instruction::initialize(
                ctx.accounts.token_program.key,
                &mint_key,
                config_key,
                Some(hook_program),
            )?,
            &[ctx.accounts.mint.to_account_info()],
        )?;
    }

    // Now initialize the mint
    anchor_lang::solana_program::program::invoke(
        &t22_ix::initialize_mint2(
            ctx.accounts.token_program.key,
            &mint_key,
            &config_key,    // mint authority
            Some(&config_key), // freeze authority
            params.decimals,
        )?,
        &[ctx.accounts.mint.to_account_info()],
    )?;

    // Initialize on-chain metadata (Token-2022 metadata extension)
    anchor_lang::solana_program::program::invoke(
        &spl_token_2022::extension::token_metadata::instruction::initialize(
            ctx.accounts.token_program.key,
            &mint_key,
            &config_key,
            &mint_key,
            &ctx.accounts.deployer.key(),
            params.name.clone(),
            params.symbol.clone(),
            params.uri.clone(),
        ),
        &[
            ctx.accounts.mint.to_account_info(),
            ctx.accounts.config.to_account_info(),
            ctx.accounts.deployer.to_account_info(),
        ],
    )?;

    // Populate config
    let config = &mut ctx.accounts.config;
    config.bump = ctx.bumps.config;
    config.preset = params.preset;
    config.mint = mint_key;
    config.supply_cap = params.supply_cap;
    config.paused = false;
    config.decimals = params.decimals;
    config.deployer = ctx.accounts.deployer.key();
    config.transfer_hook_program = hook_program;
    config.created_at = Clock::get()?.slot;
    config._reserved = [0u8; 128];

    // Grant deployer full admin + minter + burner + freezer roles
    let role = &mut ctx.accounts.deployer_role;
    role.bump = ctx.bumps.deployer_role;
    role.config = config_key;
    role.authority = ctx.accounts.deployer.key();
    role.roles = role_flags::ADMIN | role_flags::MINTER | role_flags::BURNER | role_flags::FREEZER;
    role._reserved = [0u8; 32];

    // SSS-2 deployer also gets blacklister + seizer
    if preset.is_compliant() {
        role.roles |= role_flags::BLACKLISTER | role_flags::SEIZER;
    }

    // Initialize blacklist for SSS-2
    if preset.is_compliant() {
        let blacklist_info = ctx
            .accounts
            .blacklist
            .as_ref()
            .ok_or(SssError::PresetMismatch)?;

        // Derive expected PDA
        let (expected_key, bl_bump) = Pubkey::find_program_address(
            &[b"sss_blacklist", config_key.as_ref()],
            ctx.program_id,
        );
        require_keys_eq!(blacklist_info.key(), expected_key, SssError::PresetMismatch);

        let bl_space = Blacklist::LEN;
        let bl_rent = Rent::get()?.minimum_balance(bl_space);
        let signer_seeds: &[&[u8]] = &[b"sss_blacklist", config_key.as_ref(), &[bl_bump]];

        anchor_lang::system_program::create_account(
            CpiContext::new_with_signer(
                ctx.accounts.system_program.to_account_info(),
                anchor_lang::system_program::CreateAccount {
                    from: ctx.accounts.deployer.to_account_info(),
                    to: blacklist_info.to_account_info(),
                },
                &[signer_seeds],
            ),
            bl_rent,
            bl_space as u64,
            ctx.program_id,
        )?;

        // Write discriminator + initial data
        let mut bl_data = blacklist_info.try_borrow_mut_data()?;
        let bl_disc = Blacklist::DISCRIMINATOR;
        bl_data[..8].copy_from_slice(&bl_disc);
        bl_data[8] = bl_bump;
        bl_data[9..41].copy_from_slice(config_key.as_ref());
        // count = 0 (u16 LE)
        bl_data[41..43].copy_from_slice(&0u16.to_le_bytes());
        // vec len = 0 (u32 LE)
        bl_data[43..47].copy_from_slice(&0u32.to_le_bytes());
    }

    msg!("SSS token initialized: preset={}, mint={}", params.preset, mint_key);
    Ok(())
}
