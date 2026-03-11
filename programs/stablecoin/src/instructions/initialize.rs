use anchor_lang::prelude::*;
use anchor_lang::solana_program::program::{invoke, invoke_signed};
use anchor_spl::token_interface::{
    TokenInterface,
    spl_token_2022::instruction as token_instruction,
};
use spl_token_2022::{
    extension::ExtensionType,
    state::Mint as SplMint,
};

use crate::state::*;
use crate::errors::SSSError;
use crate::events::InitializeEvent;

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct InitializeParams {
    pub preset: StablecoinPreset,
    pub name: String,
    pub symbol: String,
    pub uri: String,
    pub decimals: u8,
    pub enable_permanent_delegate: Option<bool>,
    pub enable_transfer_hook: Option<bool>,
    pub enable_confidential_transfers: Option<bool>,
    pub default_account_frozen: Option<bool>,
    pub master_minter: Pubkey,
    pub pauser: Pubkey,
    pub blacklister: Option<Pubkey>,
    pub auditor_elgamal_pubkey: Option<[u8; 32]>,
}

#[derive(Accounts)]
#[instruction(params: InitializeParams)]
pub struct Initialize<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    /// CHECK: Mint account, initialized in this instruction via CPI
    #[account(mut)]
    pub mint: Signer<'info>,

    #[account(
        init,
        payer = authority,
        space = StablecoinConfig::space(&params.name, &params.symbol, &params.uri),
        seeds = [b"config", mint.key().as_ref()],
        bump,
    )]
    pub config: Account<'info, StablecoinConfig>,

    /// CHECK: PDA that serves as mint/freeze authority
    #[account(
        seeds = [b"authority", mint.key().as_ref()],
        bump,
    )]
    pub mint_authority: UncheckedAccount<'info>,

    /// CHECK: Transfer hook program (only needed for SSS-2)
    pub transfer_hook_program: Option<UncheckedAccount<'info>>,

    pub token_program: Interface<'info, TokenInterface>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

pub fn handler(ctx: Context<Initialize>, params: InitializeParams) -> Result<()> {
    require!(params.name.len() <= StablecoinConfig::MAX_NAME_LEN, SSSError::NameTooLong);
    require!(params.symbol.len() <= StablecoinConfig::MAX_SYMBOL_LEN, SSSError::SymbolTooLong);
    require!(params.uri.len() <= StablecoinConfig::MAX_URI_LEN, SSSError::UriTooLong);

    let (enable_transfer_hook, enable_permanent_delegate, enable_confidential_transfers, default_account_frozen) =
        match params.preset {
            StablecoinPreset::SSS1 => (false, false, false, false),
            StablecoinPreset::SSS2 => (true, true, false, false),
            StablecoinPreset::SSS3 => (false, true, true, false),
            StablecoinPreset::Custom => {
                let hook = params.enable_transfer_hook.unwrap_or(false);
                let delegate = params.enable_permanent_delegate.unwrap_or(false);
                let confidential = params.enable_confidential_transfers.unwrap_or(false);
                let frozen = params.default_account_frozen.unwrap_or(false);
                require!(!(hook && confidential), SSSError::IncompatibleExtensions);
                (hook, delegate, confidential, frozen)
            }
        };

    if enable_transfer_hook {
        require!(params.blacklister.is_some(), SSSError::InvalidPreset);
    }

    let mint_key = ctx.accounts.mint.key();

    // Calculate required extensions
    let mut extensions: Vec<ExtensionType> = vec![
        ExtensionType::MetadataPointer,
    ];
    if enable_permanent_delegate {
        extensions.push(ExtensionType::PermanentDelegate);
    }
    if enable_transfer_hook {
        extensions.push(ExtensionType::TransferHook);
    }
    if enable_confidential_transfers {
        extensions.push(ExtensionType::ConfidentialTransferMint);
    }
    if default_account_frozen {
        extensions.push(ExtensionType::DefaultAccountState);
    }

    let mint_space = ExtensionType::try_calculate_account_len::<SplMint>(&extensions)
        .map_err(|_| SSSError::InvalidPreset)?;

    // Metadata space (stored on the mint itself via MetadataPointer)
    let metadata_space = 4 + 4 + 32 + 32 +
        4 + params.name.len() +
        4 + params.symbol.len() +
        4 + params.uri.len() + 4;
    let total_space = mint_space + metadata_space;
    let lamports = Rent::get()?.minimum_balance(total_space);

    // 1. Create the mint account
    invoke(
        &anchor_lang::solana_program::system_instruction::create_account(
            ctx.accounts.authority.key,
            ctx.accounts.mint.key,
            lamports,
            mint_space as u64,
            &ctx.accounts.token_program.key(),
        ),
        &[
            ctx.accounts.authority.to_account_info(),
            ctx.accounts.mint.to_account_info(),
            ctx.accounts.system_program.to_account_info(),
        ],
    )?;

    // 2. Initialize extensions BEFORE initializeMint (order matters!)

    if enable_permanent_delegate {
        invoke(
            &token_instruction::initialize_permanent_delegate(
                &ctx.accounts.token_program.key(),
                &ctx.accounts.mint.key(),
                &ctx.accounts.mint_authority.key(),
            )?,
            &[ctx.accounts.mint.to_account_info()],
        )?;
    }

    if enable_transfer_hook {
        let hook_program_id = ctx.accounts.transfer_hook_program
            .as_ref()
            .map(|p| p.key())
            .ok_or(SSSError::InvalidPreset)?;

        invoke(
            &spl_token_2022::extension::transfer_hook::instruction::initialize(
                &ctx.accounts.token_program.key(),
                &ctx.accounts.mint.key(),
                Some(ctx.accounts.mint_authority.key()),
                Some(hook_program_id),
            )?,
            &[ctx.accounts.mint.to_account_info()],
        )?;
    }

    if enable_confidential_transfers {
        use solana_zk_sdk::encryption::pod::elgamal::PodElGamalPubkey;

        let auditor_pubkey: Option<PodElGamalPubkey> = params.auditor_elgamal_pubkey
            .map(|bytes| bytemuck::cast(bytes));

        invoke(
            &spl_token_2022::extension::confidential_transfer::instruction::initialize_mint(
                &ctx.accounts.token_program.key(),
                &ctx.accounts.mint.key(),
                Some(ctx.accounts.mint_authority.key()),
                false, // auto_approve_new_accounts = false (manual KYC gate)
                auditor_pubkey,
            )?,
            &[ctx.accounts.mint.to_account_info()],
        )?;
    }

    if default_account_frozen {
        invoke(
            &spl_token_2022::extension::default_account_state::instruction::initialize_default_account_state(
                &ctx.accounts.token_program.key(),
                &ctx.accounts.mint.key(),
                &spl_token_2022::state::AccountState::Frozen,
            )?,
            &[ctx.accounts.mint.to_account_info()],
        )?;
    }

    // Metadata Pointer (points to mint itself)
    invoke(
        &spl_token_2022::extension::metadata_pointer::instruction::initialize(
            &ctx.accounts.token_program.key(),
            &ctx.accounts.mint.key(),
            Some(ctx.accounts.mint_authority.key()),
            Some(ctx.accounts.mint.key()),
        )?,
        &[ctx.accounts.mint.to_account_info()],
    )?;

    // 3. Initialize the Mint
    invoke(
        &token_instruction::initialize_mint2(
            &ctx.accounts.token_program.key(),
            &ctx.accounts.mint.key(),
            &ctx.accounts.mint_authority.key(),
            Some(&ctx.accounts.mint_authority.key()),
            params.decimals,
        )?,
        &[ctx.accounts.mint.to_account_info()],
    )?;

    // 4. Initialize Metadata on the mint (requires PDA signature)
    let authority_bump = ctx.bumps.mint_authority;
    let authority_seeds: &[&[u8]] = &[b"authority", mint_key.as_ref(), &[authority_bump]];

    invoke_signed(
        &spl_token_metadata_interface::instruction::initialize(
            &ctx.accounts.token_program.key(),
            &ctx.accounts.mint.key(),
            &ctx.accounts.mint_authority.key(),
            &ctx.accounts.mint.key(),
            &ctx.accounts.mint_authority.key(),
            params.name.clone(),
            params.symbol.clone(),
            params.uri.clone(),
        ),
        &[
            ctx.accounts.mint.to_account_info(),
            ctx.accounts.mint_authority.to_account_info(),
        ],
        &[authority_seeds],
    )?;

    // 5. Initialize Config PDA
    let config = &mut ctx.accounts.config;
    config.mint = mint_key;
    config.preset = params.preset;
    config.name = params.name;
    config.symbol = params.symbol;
    config.uri = params.uri;
    config.decimals = params.decimals;
    config.owner = ctx.accounts.authority.key();
    config.pending_owner = None;
    config.master_minter = params.master_minter;
    config.pauser = params.pauser;
    config.blacklister = params.blacklister.unwrap_or(ctx.accounts.authority.key());
    config.is_paused = false;
    config.total_minted = 0;
    config.total_burned = 0;
    config.enable_transfer_hook = enable_transfer_hook;
    config.enable_permanent_delegate = enable_permanent_delegate;
    config.enable_confidential_transfers = enable_confidential_transfers;
    config.default_account_frozen = default_account_frozen;
    config.auditor_elgamal_pubkey = params.auditor_elgamal_pubkey;
    config.bump = ctx.bumps.config;

    emit!(InitializeEvent {
        mint: mint_key,
        preset: config.preset,
        owner: config.owner,
        timestamp: Clock::get()?.unix_timestamp,
    });

    Ok(())
}
