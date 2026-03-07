use anchor_lang::{
    prelude::*,
    system_program::{create_account, CreateAccount},
};

use crate::{
    constants::*,
    error::StableError,
    events::InitializeEvent,
    state::{
        config::{StablecoinConfig, Standard},
        MinterAccount, RoleAccount,
    },
};
use anchor_spl::{
    token_2022::{
        InitializeMint, initialize_mint, spl_token_2022::{
            self,
            extension::{ExtensionType, pausable::instruction as pausable_ix},
            state::{AccountState, Mint as SplMint},
        }
    },
    token_interface::{
        DefaultAccountStateInitialize, MetadataPointerInitialize, PermanentDelegateInitialize, TokenInterface, TokenMetadataInitialize, TransferHookInitialize, default_account_state_initialize, metadata_pointer_initialize, permanent_delegate_initialize, spl_pod::optional_keys::OptionalNonZeroPubkey, spl_token_metadata_interface::state::TokenMetadata, token_metadata_initialize, transfer_hook_initialize
    },
};
use transfer_hook::ID as TRANSFER_HOOK_ID;

#[event_cpi]
#[derive(Accounts)]
#[instruction(standard: Standard, name: String, symbol: String, uri: String, decimals: u8, _master: Pubkey, _minter: Pubkey)]
pub struct Initialize<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,
    #[account(mut)]
    pub mint: Signer<'info>,
    #[account(
        init,
        payer = admin,
        space = StablecoinConfig::DISCRIMINATOR.len() + StablecoinConfig::INIT_SPACE,
        seeds = [CONFIG_SEED, mint.key().as_ref()],
        bump,
    )]
    pub config: Account<'info, StablecoinConfig>,
    /// CHECK: Mint authority PDA (seeds [MINTER_SEED, mint]). Used as SPL mint_authority; no account data.
    #[account(
        seeds = [MINTER_SEED, mint.key().as_ref()],
        bump,
    )]
    pub mint_authority: UncheckedAccount<'info>,
    /// CHECK: Freeze authority PDA (seeds [FREEZE_SEED, mint]). Used as SPL freeze_authority; no account data.
    #[account(
        seeds = [FREEZE_SEED, mint.key().as_ref()],
        bump,
    )]
    pub freeze_authority: UncheckedAccount<'info>,
    /// CHECK: Seizer authority PDA (seeds [SEIZER_SEED, mint]). Used as SPL seizer_authority; no account data.
    #[account(
        seeds = [SEIZER_SEED, mint.key().as_ref()],
        bump,
    )]
    pub seizer_authority: UncheckedAccount<'info>,
    /// CHECK: Pause authority PDA (seeds [PAUSE_SEED, mint]). Used as Token-2022 pause authority; no account data.
    /// Required for SSS2 mints with Pausable extension; pass any account for SSS1.
    #[account(
        seeds = [PAUSE_SEED, mint.key().as_ref()],
        bump,
    )]
    pub pause_authority: UncheckedAccount<'info>,
    /// Master role account for the initial master pubkey.
    #[account(
        init,
        payer = admin,
        space = RoleAccount::DISCRIMINATOR.len() + RoleAccount::INIT_SPACE,
        seeds = [ROLE_SEED, mint.key().as_ref(), MASTER_ROLE, _master.as_ref()],
        bump,
    )]
    pub master_role: Account<'info, RoleAccount>,
    /// First minter account for the passed minter pubkey.
    #[account(
        init,
        payer = admin,
        space = MinterAccount::DISCRIMINATOR.len() + MinterAccount::INIT_SPACE,
        seeds = [ROLE_SEED, mint.key().as_ref(), MINTER_ROLE, _minter.as_ref()],
        bump,
    )]
    pub minter_account: Account<'info, MinterAccount>,
    pub token_program: Interface<'info, TokenInterface>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

pub fn handler(
    ctx: Context<Initialize>,
    standard: Standard,
    name: String,
    symbol: String,
    uri: String,
    decimals: u8,
    _master: Pubkey,
    _minter: Pubkey,
    initial_allowance: u64,
    enable_permanent_delegate: Option<bool>,
    enable_transfer_hook: Option<bool>,
    default_account_frozen: Option<bool>,
) -> Result<()> {
    let enable_permanent_delegate = enable_permanent_delegate.unwrap_or(false);
    let enable_transfer_hook = enable_transfer_hook.unwrap_or(false);
    let default_account_frozen = default_account_frozen.unwrap_or(false);

    // Token-2022 with extensions: MetadataPointer, TokenMetadata, Pausable
    let extensions = vec![
        ExtensionType::MetadataPointer,
        //ExtensionType::TokenMetadata,
        ExtensionType::Pausable,
    ];

    let token_metadata = TokenMetadata {
        update_authority: OptionalNonZeroPubkey(ctx.accounts.mint_authority.key()),
        mint: ctx.accounts.mint.key(),
        name: name.clone(),
        symbol: symbol.clone(),
        uri: uri.clone(),
        additional_metadata: vec![],
    };

    init_token(
        &ctx,
        standard.clone(),
        extensions,
        token_metadata,
        decimals,
        enable_permanent_delegate,
        enable_transfer_hook,
        default_account_frozen,
    )?;

    ctx.accounts.config.standard = standard;
    ctx.accounts.config.name = name;
    ctx.accounts.config.symbol = symbol;
    ctx.accounts.config.uri = uri;
    ctx.accounts.config.decimals = decimals;
    ctx.accounts.config.enable_permanent_delegate = enable_permanent_delegate;
    ctx.accounts.config.enable_transfer_hook = enable_transfer_hook;
    ctx.accounts.config.default_account_frozen = default_account_frozen;
    ctx.accounts.config.bump = ctx.bumps.config;

    ctx.accounts.master_role.bump = ctx.bumps.master_role;

    ctx.accounts.minter_account.bump = ctx.bumps.minter_account;
    ctx.accounts.minter_account.allowance = initial_allowance;
    ctx.accounts.minter_account.minted = 0;

    let standard_str = match ctx.accounts.config.standard {
        crate::state::config::Standard::SSS1 => "SSS1".to_string(),
        crate::state::config::Standard::SSS2 => "SSS2".to_string(),
    };

    emit_cpi!(InitializeEvent {
        mint: ctx.accounts.mint.key(),
        standard: standard_str,
        name: ctx.accounts.config.name.clone(),
        symbol: ctx.accounts.config.symbol.clone(),
        uri: ctx.accounts.config.uri.clone(),
        decimals: ctx.accounts.config.decimals,
        enable_permanent_delegate: ctx.accounts.config.enable_permanent_delegate,
        enable_transfer_hook: ctx.accounts.config.enable_transfer_hook,
        default_account_frozen: ctx.accounts.config.default_account_frozen,
    });

    msg!("Stablecoin initialized successfully");

    Ok(())
}

fn init_token(
    ctx: &Context<Initialize>,
    standard: Standard,
    mut extensions: Vec<ExtensionType>,
    token_metadata: TokenMetadata,
    decimals: u8,
    enable_permanent_delegate: bool,
    enable_transfer_hook: bool,
    default_account_frozen: bool,
) -> Result<()> {
    require!(
        ctx.accounts.token_program.key() == spl_token_2022::ID,
        StableError::Token2022Required
    );

    if standard == Standard::SSS2 {
        if enable_permanent_delegate {
            extensions.push(ExtensionType::PermanentDelegate);
        }

        if enable_transfer_hook {
            extensions.push(ExtensionType::TransferHook);
        }

        if default_account_frozen {
            extensions.push(ExtensionType::DefaultAccountState);
        }
    }

    let mint_key = ctx.accounts.mint.key();
    let mint_authority = &ctx.accounts.mint_authority;
    let freeze_authority = &ctx.accounts.freeze_authority;
    let pause_authority = &ctx.accounts.pause_authority;
    let pause_authority_bump = ctx.bumps.pause_authority;
    let mint_authority_seeds: &[&[u8]] =
        &[MINTER_SEED, mint_key.as_ref(), &[ctx.bumps.mint_authority]];
    let mint_authority_signer = &[&mint_authority_seeds[..]];
    let seizer_seeds: &[&[u8]] = &[
        SEIZER_SEED,
        mint_key.as_ref(),
        &[ctx.bumps.seizer_authority],
    ];
    let seizer_signer = &[&seizer_seeds[..]];
    let rent = Rent::get()?;

    let mint_len = ExtensionType::try_calculate_account_len::<SplMint>(&extensions).unwrap();
    let lamports = rent.minimum_balance(mint_len + token_metadata.tlv_size_of().unwrap());

    create_account(
        CpiContext::new(
            ctx.accounts.system_program.to_account_info(),
            CreateAccount {
                from: ctx.accounts.admin.to_account_info(),
                to: ctx.accounts.mint.to_account_info(),
            },
        ),
        lamports,
        mint_len as u64,
        &spl_token_2022::ID,
    )?;

    metadata_pointer_initialize(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            MetadataPointerInitialize {
                mint: ctx.accounts.mint.to_account_info(),
                token_program_id: ctx.accounts.token_program.to_account_info(),
            },
            mint_authority_signer,
        ),
        Some(mint_authority.key()),
        Some(mint_key),
    )?;

    // Initialize Pausable extension (must come before initialize_mint).
    // anchor-spl has no wrapper for this; build and invoke_signed directly.
    let pause_init_ix =
        pausable_ix::initialize(&spl_token_2022::ID, &mint_key, &pause_authority.key())?;
    let pause_authority_seeds: &[&[u8]] = &[PAUSE_SEED, mint_key.as_ref(), &[pause_authority_bump]];

    anchor_lang::solana_program::program::invoke_signed(
        &pause_init_ix,
        &[ctx.accounts.mint.to_account_info()],
        &[pause_authority_seeds],
    )?;

    if enable_permanent_delegate && standard == Standard::SSS2 {
        permanent_delegate_initialize(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                PermanentDelegateInitialize {
                    token_program_id: ctx.accounts.token_program.to_account_info(),
                    mint: ctx.accounts.mint.to_account_info(),
                },
                seizer_signer,
            ),
            &ctx.accounts.seizer_authority.key(),
        )?;
    }

    if enable_transfer_hook && standard == Standard::SSS2 {
        transfer_hook_initialize(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                TransferHookInitialize {
                    token_program_id: ctx.accounts.token_program.to_account_info(),
                    mint: ctx.accounts.mint.to_account_info(),
                },
            ),
            Some(ctx.accounts.mint_authority.key()),
            Some(TRANSFER_HOOK_ID),
        )?;
    }

    if default_account_frozen && standard == Standard::SSS2 {
        default_account_state_initialize(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                DefaultAccountStateInitialize {
                    token_program_id: ctx.accounts.token_program.to_account_info(),
                    mint: ctx.accounts.mint.to_account_info(),
                }
            ),
            &AccountState::Frozen,
        )?;
    }

    initialize_mint(
        CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            InitializeMint {
                mint: ctx.accounts.mint.to_account_info(),
                rent: ctx.accounts.rent.to_account_info(),
            },
            //mint_signer,
        ),
        decimals,
        &mint_authority.key(),
        Some(&freeze_authority.key()),
    )?;

    token_metadata_initialize(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            TokenMetadataInitialize {
                mint: ctx.accounts.mint.to_account_info(),
                metadata: ctx.accounts.mint.to_account_info(),
                mint_authority: mint_authority.to_account_info(),
                update_authority: mint_authority.to_account_info(),
                program_id: ctx.accounts.token_program.to_account_info(),
            },
            mint_authority_signer,
        ),
        token_metadata.name,
        token_metadata.symbol,
        token_metadata.uri,
    )?;

    Ok(())
}
