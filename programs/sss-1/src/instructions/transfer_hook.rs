use anchor_lang::prelude::*;
use anchor_spl::token_interface::Mint;
use spl_token_2022::id as token_2022_program_id;
use spl_token_2022::extension::StateWithExtensions;
use spl_transfer_hook_interface::instruction::ExecuteInstruction;

use crate::{
    constants::{BLACKLIST_SEED, EXTRA_ACCOUNT_META_LIST_SEED, HOOK_CONFIG_SEED},
    error::StablecoinError,
    state::HookConfig,
};

/// The transfer hook execute instruction.
/// This is called by the Token-2022 program during transfers.
/// It checks that neither the source wallet owner nor destination wallet owner is blacklisted.
#[derive(Accounts)]
pub struct TransferHook<'info> {
    /// CHECK: Source token account (provided by Token-2022 runtime)
    pub source: UncheckedAccount<'info>,

    pub mint: InterfaceAccount<'info, Mint>,

    /// CHECK: Destination token account (provided by Token-2022 runtime)
    pub destination: UncheckedAccount<'info>,

    /// CHECK: Owner/delegate of source account (provided by Token-2022 runtime)
    /// Not used for compliance identity derivation; wallet owner is decoded from `source`.
    pub owner: UncheckedAccount<'info>,

    /// CHECK: Extra account meta list PDA
    #[account(
        seeds = [EXTRA_ACCOUNT_META_LIST_SEED, mint.key().as_ref()],
        bump,
    )]
    pub extra_account_meta_list: UncheckedAccount<'info>,

    #[account(
        seeds = [HOOK_CONFIG_SEED, mint.key().as_ref()],
        bump = hook_config.bump,
    )]
    pub hook_config: Account<'info, HookConfig>,

    /// CHECK: Blacklist PDA for source owner - if it exists, source is blacklisted.
    /// Seeds: ["blacklist", hook_config, source_owner]
    pub source_blacklist: UncheckedAccount<'info>,

    /// CHECK: Blacklist PDA for destination owner - if it exists, destination is blacklisted.
    /// Seeds: ["blacklist", hook_config, destination_owner]
    pub destination_blacklist: UncheckedAccount<'info>,
}

impl<'info> TransferHook<'info> {
    fn check_not_blacklisted(
        blacklist_account: &UncheckedAccount<'info>,
        hook_config_key: &Pubkey,
        address: &Pubkey,
        program_id: &Pubkey,
    ) -> Result<()> {
        // Derive expected PDA
        let (expected_pda, _bump) = Pubkey::find_program_address(
            &[BLACKLIST_SEED, hook_config_key.as_ref(), address.as_ref()],
            program_id,
        );

        // A mismatched account would allow callers to bypass checks by passing
        // an arbitrary account instead of the expected blacklist PDA.
        require_keys_eq!(
            blacklist_account.key(),
            expected_pda,
            StablecoinError::InvalidBlacklistAccount
        );

        // If the account key matches the expected PDA and has data,
        // the address is blacklisted
        if !blacklist_account.data_is_empty() {
            return Err(StablecoinError::Blacklisted.into());
        }

        Ok(())
    }

    fn token_account(account: &UncheckedAccount<'info>) -> Result<spl_token_2022::state::Account> {
        require_keys_eq!(
            *account.owner,
            token_2022_program_id(),
            StablecoinError::InvalidTokenProgramOwner
        );

        let data = account.try_borrow_data()?;
        let token_account = StateWithExtensions::<anchor_spl::token_2022::spl_token_2022::state::Account>::unpack(&data)
            .map_err(|_| StablecoinError::InvalidTokenAccount)?;
        Ok(token_account.base)
    }
}

pub fn handler(ctx: Context<TransferHook>, _amount: u64) -> Result<()> {
    let expected_mint = ctx.accounts.mint.key();
    let source_state = TransferHook::token_account(&ctx.accounts.source)?;
    let destination_state = TransferHook::token_account(&ctx.accounts.destination)?;

    require_keys_eq!(
        source_state.mint,
        expected_mint,
        StablecoinError::InvalidTokenAccountMint
    );
    require_keys_eq!(
        destination_state.mint,
        expected_mint,
        StablecoinError::InvalidTokenAccountMint
    );

    // Compliance mode gates blacklist enforcement only.
    // Structural validation (token-account owner + mint alignment) must always execute.
    if !ctx.accounts.hook_config.compliance_enabled {
        return Ok(());
    }

    let hook_config_key = ctx.accounts.hook_config.key();
    let program_id = ctx.program_id;

    // Source compliance must be wallet-owner-based, not delegate-based.
    let source_owner = source_state.owner;
    TransferHook::check_not_blacklisted(
        &ctx.accounts.source_blacklist,
        &hook_config_key,
        &source_owner,
        program_id,
    )?;

    // Destination compliance must be owner-based (wallet), not token-account-based.
    let destination_owner = destination_state.owner;
    TransferHook::check_not_blacklisted(
        &ctx.accounts.destination_blacklist,
        &hook_config_key,
        &destination_owner,
        program_id,
    )?;

    Ok(())
}

/// Initialize the extra account metas required by the transfer hook.
/// Must be called once after hook initialization.
#[derive(Accounts)]
pub struct InitializeExtraAccountMetaList<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    /// CHECK: Extra account meta list PDA - initialized in handler
    #[account(
        mut,
        seeds = [EXTRA_ACCOUNT_META_LIST_SEED, mint.key().as_ref()],
        bump,
    )]
    pub extra_account_meta_list: UncheckedAccount<'info>,

    pub mint: InterfaceAccount<'info, Mint>,

    #[account(
        seeds = [HOOK_CONFIG_SEED, mint.key().as_ref()],
        bump = hook_config.bump,
        constraint = hook_config.authority == authority.key() @ StablecoinError::Unauthorized,
    )]
    pub hook_config: Account<'info, HookConfig>,

    pub system_program: Program<'info, System>,
}

pub fn initialize_extra_account_meta_list_handler(
    ctx: Context<InitializeExtraAccountMetaList>,
) -> Result<()> {
    use spl_tlv_account_resolution::{
        account::ExtraAccountMeta, seeds::Seed, state::ExtraAccountMetaList,
    };

    let mint_key = ctx.accounts.mint.key();
    // Define the extra accounts needed by the transfer hook:
    // 1. hook_config PDA
    // 2. source_blacklist PDA (derived from hook_config + source token-account owner)
    // 3. destination_blacklist PDA (derived from hook_config + destination owner)
    let extra_metas = vec![
        // hook_config: PDA with seeds ["hook_config", mint]
        ExtraAccountMeta::new_with_seeds(
            &[
                Seed::Literal {
                    bytes: HOOK_CONFIG_SEED.to_vec(),
                },
                Seed::AccountKey { index: 1 }, // mint
            ],
            false, // is_signer
            false, // is_writable
        )?,
        // source_blacklist: PDA with seeds ["blacklist", hook_config, source token-account owner]
        ExtraAccountMeta::new_with_seeds(
            &[
                Seed::Literal {
                    bytes: BLACKLIST_SEED.to_vec(),
                },
                Seed::AccountKey { index: 5 }, // hook_config (first extra account)
                Seed::AccountData {
                    account_index: 0, // source token account
                    data_index: 32,   // token account owner field offset
                    length: 32,       // pubkey length
                },
            ],
            false,
            false,
        )?,
        // destination_blacklist: PDA with seeds ["blacklist", hook_config, destination owner]
        ExtraAccountMeta::new_with_seeds(
            &[
                Seed::Literal {
                    bytes: BLACKLIST_SEED.to_vec(),
                },
                Seed::AccountKey { index: 5 }, // hook_config (first extra account)
                Seed::AccountData {
                    account_index: 2, // destination token account
                    data_index: 32,   // token account owner field offset
                    length: 32,       // pubkey length
                },
            ],
            false,
            false,
        )?,
    ];

    // Calculate space needed
    let account_size = ExtraAccountMetaList::size_of(extra_metas.len())?;
    let lamports = Rent::get()?.minimum_balance(account_size);

    let bump = ctx.bumps.extra_account_meta_list;
    let bump_bytes = [bump];
    let signer_seeds: &[&[u8]] = &[EXTRA_ACCOUNT_META_LIST_SEED, mint_key.as_ref(), &bump_bytes];

    // Create the extra account meta list account
    anchor_lang::solana_program::program::invoke_signed(
        &anchor_lang::solana_program::system_instruction::create_account(
            &ctx.accounts.authority.key(),
            &ctx.accounts.extra_account_meta_list.key(),
            lamports,
            account_size as u64,
            ctx.program_id,
        ),
        &[
            ctx.accounts.authority.to_account_info(),
            ctx.accounts.extra_account_meta_list.to_account_info(),
            ctx.accounts.system_program.to_account_info(),
        ],
        &[signer_seeds],
    )?;

    // Initialize the extra account meta list
    let mut data = ctx.accounts.extra_account_meta_list.try_borrow_mut_data()?;
    ExtraAccountMetaList::init::<ExecuteInstruction>(&mut data, &extra_metas)?;

    Ok(())
}
