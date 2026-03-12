use anchor_lang::prelude::*;
use anchor_spl::token_2022::Token2022;
use spl_token_2022::{
    extension::{
        default_account_state::instruction::initialize_default_account_state,
        metadata_pointer::instruction::initialize as initialize_metadata_pointer,
        transfer_hook::instruction::initialize as initialize_transfer_hook,
        ExtensionType,
    },
    instruction::{
        initialize_mint2,
        initialize_mint_close_authority,
        initialize_permanent_delegate,
    },
    state::AccountState,
};
use anchor_lang::solana_program::program::{invoke, invoke_signed};

use crate::{
    constants::*,
    error::SssError,
    events::StablecoinInitialized,
    state::{StablecoinConfig, StablecoinState},
};

#[derive(Accounts)]
#[instruction(config: StablecoinConfig)]
pub struct Initialize<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    /// The mint account — we create it manually to add extensions before init.
    /// CHECK: Created and validated in the instruction handler.
    #[account(mut)]
    pub mint: Signer<'info>,

    #[account(
        init,
        payer = authority,
        space = StablecoinState::space(&config.name, &config.symbol, &config.uri),
        seeds = [STABLECOIN_SEED, mint.key().as_ref()],
        bump,
    )]
    pub stablecoin_state: Account<'info, StablecoinState>,

    /// CHECK: Transfer hook program — only validated if enable_transfer_hook is set.
    pub transfer_hook_program: Option<AccountInfo<'info>>,

    pub token_program: Program<'info, Token2022>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

pub fn handler(ctx: Context<Initialize>, config: StablecoinConfig) -> Result<()> {
    // Validate config
    require!(config.name.len() <= MAX_NAME_LEN, SssError::NameTooLong);
    require!(config.symbol.len() <= MAX_SYMBOL_LEN, SssError::SymbolTooLong);
    require!(config.uri.len() <= MAX_URI_LEN, SssError::UriTooLong);
    require!(
        config.decimals <= MAX_DECIMALS,
        SssError::InvalidDecimals
    );

    let mint_key = ctx.accounts.mint.key();
    let state_bump = ctx.bumps.stablecoin_state;

    // Build extension list based on config
    let mut extensions: Vec<ExtensionType> = vec![
        ExtensionType::MetadataPointer,
        ExtensionType::MintCloseAuthority,
    ];

    if config.enable_permanent_delegate {
        extensions.push(ExtensionType::PermanentDelegate);
    }
    if config.enable_transfer_hook {
        extensions.push(ExtensionType::TransferHook);
    }
    if config.default_account_frozen {
        extensions.push(ExtensionType::DefaultAccountState);
    }

    // Calculate mint account size with all extensions
    let mint_size = ExtensionType::try_calculate_account_len::<spl_token_2022::state::Mint>(&extensions)?;
    let lamports = ctx.accounts.rent.minimum_balance(mint_size);

    // Create the mint account
    anchor_lang::system_program::create_account(
        CpiContext::new(
            ctx.accounts.system_program.to_account_info(),
            anchor_lang::system_program::CreateAccount {
                from: ctx.accounts.authority.to_account_info(),
                to: ctx.accounts.mint.to_account_info(),
            },
        ),
        lamports,
        mint_size as u64,
        &spl_token_2022::id(),
    )?;

    let authority_key = ctx.accounts.authority.key();
    // The stablecoin PDA acts as mint authority and freeze authority so the program
    // can CPI into Token-2022 for mint/freeze/thaw/seize without requiring the
    // original signer each time.
    let stablecoin_pda = ctx.accounts.stablecoin_state.key();

    // Initialize extensions before calling InitializeMint
    if config.enable_permanent_delegate {
        invoke(
            &initialize_permanent_delegate(
                &spl_token_2022::id(),
                &mint_key,
                &stablecoin_pda,
            )?,
            &[ctx.accounts.mint.to_account_info()],
        )?;
    }

    if config.enable_transfer_hook {
        let hook_program_id = ctx
            .accounts
            .transfer_hook_program
            .as_ref()
            .map(|a| a.key())
            .unwrap_or(crate::id());

        invoke(
            &initialize_transfer_hook(
                &spl_token_2022::id(),
                &mint_key,
                Some(authority_key),
                Some(hook_program_id),
            )?,
            &[ctx.accounts.mint.to_account_info()],
        )?;
    }

    if config.default_account_frozen {
        invoke(
            &initialize_default_account_state(
                &spl_token_2022::id(),
                &mint_key,
                &AccountState::Frozen,
            )?,
            &[ctx.accounts.mint.to_account_info()],
        )?;
    }

    // MetadataPointer — points metadata to the mint itself (Token-2022 embedded metadata)
    invoke(
        &initialize_metadata_pointer(
            &spl_token_2022::id(),
            &mint_key,
            Some(authority_key),
            Some(mint_key),
        )?,
        &[ctx.accounts.mint.to_account_info()],
    )?;

    // MintCloseAuthority — kept with the human authority (can close supply-zero mints)
    invoke(
        &initialize_mint_close_authority(
            &spl_token_2022::id(),
            &mint_key,
            Some(&authority_key),
        )?,
        &[ctx.accounts.mint.to_account_info()],
    )?;

    // Initialize the mint — the PDA is both mint authority and freeze authority
    // so the program can sign CPI calls for mint/freeze/thaw/seize.
    invoke(
        &initialize_mint2(
            &spl_token_2022::id(),
            &mint_key,
            &stablecoin_pda,       // mint authority = PDA (program-controlled)
            Some(&stablecoin_pda), // freeze authority = PDA
            config.decimals,
        )?,
        &[ctx.accounts.mint.to_account_info()],
    )?;

    // Initialize metadata on the mint (using Token-2022 embedded metadata).
    // The PDA is the mint authority so it signs this CPI.
    let metadata_ix = spl_token_metadata_interface::instruction::initialize(
        &spl_token_2022::id(),
        &mint_key,       // metadata account (same as mint for embedded)
        &authority_key,  // update authority (human operator)
        &mint_key,       // mint
        &stablecoin_pda, // mint authority signing
        config.name.clone(),
        config.symbol.clone(),
        config.uri.clone(),
    );
    let bump = ctx.bumps.stablecoin_state;
    let signer_seeds: &[&[&[u8]]] = &[&[STABLECOIN_SEED, mint_key.as_ref(), &[bump]]];
    invoke_signed(
        &metadata_ix,
        &[
            ctx.accounts.mint.to_account_info(),
            ctx.accounts.authority.to_account_info(),
            ctx.accounts.mint.to_account_info(),
            ctx.accounts.stablecoin_state.to_account_info(),
        ],
        signer_seeds,
    )?;

    // Write stablecoin state
    let state = &mut ctx.accounts.stablecoin_state;
    state.mint = mint_key;
    state.authority = authority_key;
    state.freeze_authority = stablecoin_pda;
    state.preset = config.preset_id();
    state.decimals = config.decimals;
    state.paused = false;
    state.enable_transfer_hook = config.enable_transfer_hook;
    state.enable_permanent_delegate = config.enable_permanent_delegate;
    state.default_account_frozen = config.default_account_frozen;
    state.burners = vec![];
    state.pausers = vec![];
    state.blacklisters = vec![];
    state.seizers = vec![];
    state.name = config.name.clone();
    state.symbol = config.symbol.clone();
    state.uri = config.uri.clone();
    state.bump = state_bump;

    if config.enable_permanent_delegate {
        // `stablecoin_pda` was captured from the account key before the mutable borrow
        state.permanent_delegate = Some(stablecoin_pda);
    }

    emit!(StablecoinInitialized {
        mint: mint_key,
        name: config.name,
        symbol: config.symbol,
        decimals: config.decimals,
        authority: authority_key,
        preset: state.preset,
        timestamp: Clock::get()?.unix_timestamp,
    });

    Ok(())
}
