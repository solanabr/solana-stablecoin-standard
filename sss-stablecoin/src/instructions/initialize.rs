use anchor_lang::prelude::*;
use anchor_lang::solana_program::program::invoke;
use anchor_lang::solana_program::system_instruction;
use anchor_spl::token_2022::Token2022;
use spl_token_2022::extension::default_account_state::instruction::initialize_default_account_state;
use spl_token_2022::extension::transfer_hook::instruction::initialize as initialize_transfer_hook;
use spl_token_2022::extension::ExtensionType;
use spl_token_2022::instruction as token_instruction;
use spl_token_2022::state::{AccountState, Mint as SplMint};

use crate::errors::StablecoinError;
use crate::events::*;
use crate::state::{RoleRegistry, StablecoinConfig};

#[derive(Accounts)]
#[instruction(name: String, symbol: String, decimals: u8)]
pub struct Initialize<'info> {
    #[account(
        init,
        payer = authority,
        space = 8 + StablecoinConfig::LEN,
        seeds = [StablecoinConfig::SEED_PREFIX.as_bytes(), authority.key().as_ref(), symbol.as_bytes()],
        bump
    )]
    pub config: Account<'info, StablecoinConfig>,
    #[account(
        init,
        payer = authority,
        space = 8 + RoleRegistry::LEN,
        seeds = [RoleRegistry::SEED_PREFIX.as_bytes(), config.key().as_ref()],
        bump
    )]
    pub role_registry: Account<'info, RoleRegistry>,
    /// CHECK: created manually with extension space
    #[account(mut, signer)]
    pub mint: AccountInfo<'info>,
    #[account(mut)]
    pub authority: Signer<'info>,
    /// CHECK: transfer hook program id, required when transfer hook is enabled
    pub transfer_hook_program_id: Option<UncheckedAccount<'info>>,
    pub token_program: Program<'info, Token2022>,
    pub system_program: Program<'info, System>,
}

pub fn initialize(
    ctx: Context<Initialize>,
    name: String,
    symbol: String,
    decimals: u8,
    enable_permanent_delegate: bool,
    enable_transfer_hook: bool,
    default_account_frozen: bool,
    enable_privacy: bool,
) -> Result<()> {
    require!(
        name.len() <= StablecoinConfig::MAX_NAME_LEN,
        StablecoinError::InvalidRole
    );
    require!(
        symbol.len() <= StablecoinConfig::MAX_SYMBOL_LEN,
        StablecoinError::InvalidRole
    );

    let extension_types = selected_extensions(
        enable_permanent_delegate,
        enable_transfer_hook,
        default_account_frozen,
    );

    let mint_len = ExtensionType::try_calculate_account_len::<SplMint>(&extension_types)
        .map_err(|_| error!(StablecoinError::InvalidRole))?;
    let rent = Rent::get()?;
    let lamports = rent.minimum_balance(mint_len);

    invoke(
        &system_instruction::create_account(
            ctx.accounts.authority.key,
            ctx.accounts.mint.key,
            lamports,
            mint_len as u64,
            &spl_token_2022::id(),
        ),
        &[
            ctx.accounts.authority.to_account_info(),
            ctx.accounts.mint.to_account_info(),
        ],
    )?;

    if enable_permanent_delegate {
        invoke(
            &token_instruction::initialize_permanent_delegate(
                &spl_token_2022::id(),
                ctx.accounts.mint.key,
                &ctx.accounts.config.key(),
            )?,
            &[ctx.accounts.mint.to_account_info()],
        )?;
    }

    if enable_transfer_hook {
        let transfer_hook_program = ctx
            .accounts
            .transfer_hook_program_id
            .as_ref()
            .ok_or_else(|| error!(StablecoinError::ComplianceNotEnabled))?;

        invoke(
            &initialize_transfer_hook(
                &spl_token_2022::id(),
                ctx.accounts.mint.key,
                Some(ctx.accounts.config.key()),
                Some(transfer_hook_program.key()),
            )?,
            &[ctx.accounts.mint.to_account_info()],
        )?;
    }

    if default_account_frozen {
        invoke(
            &initialize_default_account_state(
                &spl_token_2022::id(),
                ctx.accounts.mint.key,
                &AccountState::Frozen,
            )?,
            &[ctx.accounts.mint.to_account_info()],
        )?;
    }

    invoke(
        &token_instruction::initialize_mint2(
            &spl_token_2022::id(),
            ctx.accounts.mint.key,
            &ctx.accounts.config.key(),
            Some(&ctx.accounts.config.key()),
            decimals,
        )?,
        &[ctx.accounts.mint.to_account_info()],
    )?;

    let authority = ctx.accounts.authority.key();
    let config = &mut ctx.accounts.config;
    config.authority = authority;
    config.mint = ctx.accounts.mint.key();
    config.name = name.clone();
    config.symbol = symbol.clone();
    config.decimals = decimals;
    config.paused = false;
    config.total_minted = 0;
    config.total_burned = 0;
    config.enable_permanent_delegate = enable_permanent_delegate;
    config.enable_transfer_hook = enable_transfer_hook;
    config.default_account_frozen = default_account_frozen;
    config.enable_privacy = enable_privacy;
    config.proposed_authority = None;
    config.bump = ctx.bumps.config;

    let roles = &mut ctx.accounts.role_registry;
    roles.config = config.key();
    roles.master = authority;
    roles.minters = Vec::new();
    roles.burners = Vec::new();
    roles.pausers = Vec::new();
    roles.blacklisters = Vec::new();
    roles.seizers = Vec::new();
    roles.bump = ctx.bumps.role_registry;

    emit!(StablecoinInitialized {
        authority,
        mint: config.mint,
        name,
        symbol,
    });

    Ok(())
}

fn selected_extensions(
    enable_permanent_delegate: bool,
    enable_transfer_hook: bool,
    default_account_frozen: bool,
) -> Vec<ExtensionType> {
    let mut extensions = Vec::new();
    if enable_permanent_delegate {
        extensions.push(ExtensionType::PermanentDelegate);
    }
    if enable_transfer_hook {
        extensions.push(ExtensionType::TransferHook);
    }
    if default_account_frozen {
        extensions.push(ExtensionType::DefaultAccountState);
    }
    extensions
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn extensions_are_empty_when_all_flags_disabled() {
        let exts = selected_extensions(false, false, false);
        assert!(exts.is_empty());
    }

    #[test]
    fn extensions_include_permanent_delegate_when_enabled() {
        let exts = selected_extensions(true, false, false);
        assert_eq!(exts, vec![ExtensionType::PermanentDelegate]);
    }

    #[test]
    fn extensions_include_transfer_hook_when_enabled() {
        let exts = selected_extensions(false, true, false);
        assert_eq!(exts, vec![ExtensionType::TransferHook]);
    }

    #[test]
    fn extensions_include_default_account_state_when_enabled() {
        let exts = selected_extensions(false, false, true);
        assert_eq!(exts, vec![ExtensionType::DefaultAccountState]);
    }

    #[test]
    fn extensions_include_all_optional_extensions() {
        let exts = selected_extensions(true, true, true);
        assert_eq!(
            exts,
            vec![
                ExtensionType::PermanentDelegate,
                ExtensionType::TransferHook,
                ExtensionType::DefaultAccountState,
            ]
        );
    }

    #[test]
    fn mint_len_calculates_for_base_extension_set() {
        let exts = selected_extensions(false, false, false);
        let len = ExtensionType::try_calculate_account_len::<SplMint>(&exts).unwrap();
        assert!(len > 0);
    }

    #[test]
    fn mint_len_calculates_for_all_extensions() {
        let exts = selected_extensions(true, true, true);
        let len = ExtensionType::try_calculate_account_len::<SplMint>(&exts).unwrap();
        assert!(len > 0);
    }

    #[test]
    fn mint_len_grows_when_optional_extensions_added() {
        let base = ExtensionType::try_calculate_account_len::<SplMint>(&selected_extensions(
            false, false, false,
        ))
        .unwrap();
        let full = ExtensionType::try_calculate_account_len::<SplMint>(&selected_extensions(
            true, true, true,
        ))
        .unwrap();
        assert!(full > base);
    }

    #[test]
    fn max_name_length_constant_is_32() {
        assert_eq!(StablecoinConfig::MAX_NAME_LEN, 32);
    }

    #[test]
    fn max_symbol_length_constant_is_10() {
        assert_eq!(StablecoinConfig::MAX_SYMBOL_LEN, 10);
    }
}
