use crate::constants::*;
use crate::error::SSSError;
use crate::events::StablecoinInitialized;
use crate::state::StablecoinConfig;
use anchor_lang::prelude::*;
use anchor_lang::system_program::{create_account, CreateAccount};
use anchor_spl::token_2022::{
    initialize_mint2, spl_token_2022::extension::ExtensionType, spl_token_2022::pod::PodMint,
    InitializeMint2, Token2022,
};
use anchor_spl::token_2022_extensions::{
    default_account_state_initialize, metadata_pointer_initialize, mint_close_authority_initialize,
    permanent_delegate_initialize, token_metadata_initialize, transfer_hook_initialize,
    DefaultAccountStateInitialize, MetadataPointerInitialize, MintCloseAuthorityInitialize,
    PermanentDelegateInitialize, TokenMetadataInitialize, TransferHookInitialize,
};

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct InitializeParams {
    pub preset: u8,
    pub name: String,
    pub symbol: String,
    pub uri: String,
    pub decimals: u8,
}

#[derive(Accounts)]
#[instruction(params: InitializeParams)]
pub struct Initialize<'info> {
    /// Authority who will own this stablecoin. Pays for account creation.
    #[account(mut)]
    pub authority: Signer<'info>,

    /// Fresh keypair for the Token-2022 mint. Client generates and signs.
    #[account(mut)]
    pub mint: Signer<'info>,

    /// Stablecoin configuration PDA.
    #[account(
        init,
        payer = authority,
        space = 8 + StablecoinConfig::INIT_SPACE,
        seeds = [CONFIG_SEED, mint.key().as_ref()],
        bump,
    )]
    pub config: Account<'info, StablecoinConfig>,

    /// Mint authority PDA — holds mint, freeze, and permanent delegate authority.
    /// CHECK: This is a PDA used as the token authority. No data stored.
    #[account(
        seeds = [MINT_AUTHORITY_SEED, mint.key().as_ref()],
        bump,
    )]
    pub mint_authority: SystemAccount<'info>,

    /// The hook program ID for SSS-2. Required if preset == 2.
    /// CHECK: Validated in instruction logic based on preset.
    pub hook_program: Option<UncheckedAccount<'info>>,

    pub token_program: Program<'info, Token2022>,
    pub system_program: Program<'info, System>,
}

pub fn handle_initialize(ctx: Context<Initialize>, params: InitializeParams) -> Result<()> {
    // ── 1. VALIDATE ─────────────────────────────────────────────────────────
    require!(
        params.preset == PRESET_MINIMAL || params.preset == PRESET_COMPLIANT,
        SSSError::InvalidPreset
    );
    require!(params.decimals <= MAX_DECIMALS, SSSError::InvalidDecimals);
    require!(params.name.len() <= MAX_NAME_LEN, SSSError::NameTooLong);
    require!(
        params.symbol.len() <= MAX_SYMBOL_LEN,
        SSSError::SymbolTooLong
    );
    require!(params.uri.len() <= MAX_URI_LEN, SSSError::UriTooLong);

    if params.preset == PRESET_COMPLIANT {
        require!(
            ctx.accounts.hook_program.is_some(),
            SSSError::HookProgramRequired
        );
    }

    let mint_key = ctx.accounts.mint.key();
    let mint_authority_key = ctx.accounts.mint_authority.key();

    // ── 2. COMPUTE extension set and account size ───────────────────────────
    let mut extensions = vec![
        ExtensionType::MetadataPointer,
        ExtensionType::MintCloseAuthority,
    ];

    if params.preset == PRESET_COMPLIANT {
        extensions.push(ExtensionType::PermanentDelegate);
        extensions.push(ExtensionType::TransferHook);
        extensions.push(ExtensionType::DefaultAccountState);
    }

    let base_size = ExtensionType::try_calculate_account_len::<PodMint>(&extensions)
        .map_err(|_| SSSError::ArithmeticOverflow)?;

    // Token metadata is variable-length and stored as a TLV entry after the mint data.
    // `token_metadata_initialize` will realloc the account to fit the metadata,
    // but it needs enough lamports pre-funded for rent-exemption at the final size.
    // We allocate ONLY `base_size` for the data length (so InitializeMint2 sees a clean TLV),
    // but pay lamports for the full final size including metadata.
    let metadata_size = 4 // TLV type (2) + length (2)
        + 32 + 32 // update_authority + mint
        + (4 + params.name.len())
        + (4 + params.symbol.len())
        + (4 + params.uri.len())
        + 4 // additional_metadata vec length (empty = 0 entries)
        + 64; // alignment and future padding

    let rent = Rent::get()?;
    let lamports = rent.minimum_balance(base_size + metadata_size);

    // ── 3. EXECUTE: Create the mint account ─────────────────────────────────
    // Data length = base_size only; token_metadata_initialize will realloc.
    create_account(
        CpiContext::new(
            ctx.accounts.system_program.to_account_info(),
            CreateAccount {
                from: ctx.accounts.authority.to_account_info(),
                to: ctx.accounts.mint.to_account_info(),
            },
        ),
        lamports,
        base_size as u64,
        &ctx.accounts.token_program.key(),
    )?;

    // ── 4. EXECUTE: Initialize extensions (BEFORE mint init) ────────────────

    // MetadataPointer → points to the mint itself for on-chain metadata
    metadata_pointer_initialize(
        CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            MetadataPointerInitialize {
                token_program_id: ctx.accounts.token_program.to_account_info(),
                mint: ctx.accounts.mint.to_account_info(),
            },
        ),
        Some(mint_authority_key),
        Some(mint_key),
    )?;

    // MintCloseAuthority → allows closing mint if supply reaches 0
    mint_close_authority_initialize(
        CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            MintCloseAuthorityInitialize {
                token_program_id: ctx.accounts.token_program.to_account_info(),
                mint: ctx.accounts.mint.to_account_info(),
            },
        ),
        Some(&mint_authority_key),
    )?;

    // SSS-2 specific extensions
    if params.preset == PRESET_COMPLIANT {
        let hook_program = ctx.accounts.hook_program.as_ref().unwrap();

        // PermanentDelegate → enables seize/clawback via the mint authority PDA
        permanent_delegate_initialize(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                PermanentDelegateInitialize {
                    token_program_id: ctx.accounts.token_program.to_account_info(),
                    mint: ctx.accounts.mint.to_account_info(),
                },
            ),
            &mint_authority_key,
        )?;

        // TransferHook → points to sss-hook program for compliance checks
        transfer_hook_initialize(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                TransferHookInitialize {
                    token_program_id: ctx.accounts.token_program.to_account_info(),
                    mint: ctx.accounts.mint.to_account_info(),
                },
            ),
            Some(mint_authority_key),
            Some(hook_program.key()),
        )?;

        // DefaultAccountState::Frozen → KYC gate, all new accounts start frozen
        default_account_state_initialize(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                DefaultAccountStateInitialize {
                    token_program_id: ctx.accounts.token_program.to_account_info(),
                    mint: ctx.accounts.mint.to_account_info(),
                },
            ),
            &anchor_spl::token_2022::spl_token_2022::state::AccountState::Frozen,
        )?;
    }

    // ── 5. EXECUTE: Initialize mint (MUST be after all extension inits) ─────
    initialize_mint2(
        CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            InitializeMint2 {
                mint: ctx.accounts.mint.to_account_info(),
            },
        ),
        params.decimals,
        &mint_authority_key,
        Some(&mint_authority_key),
    )?;

    // ── 6. EXECUTE: Initialize token metadata ───────────────────────────────
    let mint_authority_bump = ctx.bumps.mint_authority;
    let signer_seeds: &[&[&[u8]]] = &[&[
        MINT_AUTHORITY_SEED,
        mint_key.as_ref(),
        &[mint_authority_bump],
    ]];

    token_metadata_initialize(
        CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            TokenMetadataInitialize {
                program_id: ctx.accounts.token_program.to_account_info(),
                mint: ctx.accounts.mint.to_account_info(),
                metadata: ctx.accounts.mint.to_account_info(),
                mint_authority: ctx.accounts.mint_authority.to_account_info(),
                update_authority: ctx.accounts.mint_authority.to_account_info(),
            },
        )
        .with_signer(signer_seeds),
        params.name.clone(),
        params.symbol.clone(),
        params.uri.clone(),
    )?;

    // ── 7. UPDATE STATE: Populate config ────────────────────────────────────
    let config = &mut ctx.accounts.config;
    config.mint = mint_key;
    config.preset = params.preset;
    config.authority = ctx.accounts.authority.key();
    config.pending_authority = Pubkey::default();
    config.master_minter = ctx.accounts.authority.key();
    config.pauser = ctx.accounts.authority.key();
    config.blacklister = ctx.accounts.authority.key();
    config.paused = false;
    config.total_minted = 0;
    config.total_burned = 0;
    config.bump = ctx.bumps.config;
    config.mint_authority_bump = mint_authority_bump;

    // ── 8. EMIT EVENT ───────────────────────────────────────────────────────
    emit!(StablecoinInitialized {
        mint: mint_key,
        preset: params.preset,
        authority: ctx.accounts.authority.key(),
        decimals: params.decimals,
        name: params.name,
        symbol: params.symbol,
    });

    Ok(())
}
