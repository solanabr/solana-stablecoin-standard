use anchor_lang::prelude::*;
use anchor_lang::solana_program::program::{invoke, invoke_signed};
use anchor_lang::solana_program::pubkey::Pubkey as SolPubkey;
use anchor_spl::token_interface::TokenInterface;
use spl_token_2022::{extension::ExtensionType, instruction as token_instruction, state::Mint};

use crate::state::{RoleManager, StablecoinConfig};

/// Parameters for initializing a new stablecoin.
///
/// These determine which Token-2022 extensions get enabled on the mint.
/// Feature flags are **immutable** after initialization — choose carefully.
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct InitializeParams {
    /// Human-readable name (max 32 chars)
    pub name: String,
    /// Ticker symbol (max 10 chars)
    pub symbol: String,
    /// Metadata URI (max 200 chars)
    pub uri: String,
    /// Token decimals (typically 6 for stablecoins)
    pub decimals: u8,
    /// SSS-2: Enable permanent delegate (allows seize)
    pub enable_permanent_delegate: bool,
    /// SSS-2: Enable transfer hook (for blacklist enforcement)
    pub enable_transfer_hook: bool,
    /// SSS-3: Enable confidential transfers (experimental)
    pub enable_confidential_transfers: bool,
    /// SSS-2: New token accounts start frozen by default
    pub default_account_frozen: bool,
    /// Address that can pause/unpause operations
    pub pauser: Pubkey,
    /// SSS-2: Address that manages the blacklist
    pub blacklister: Option<Pubkey>,
    /// SSS-2: Address that can seize tokens
    pub seizer: Option<Pubkey>,
}

/// Accounts for the initialize instruction.
///
/// ## How it works:
/// 1. Creates the Token-2022 mint with the right extensions
/// 2. Initializes StablecoinConfig PDA (stores feature flags + metadata)
/// 3. Initializes RoleManager PDA (stores role assignments)
///
/// The config PDA becomes the mint authority AND freeze authority,
/// so only the program can mint/freeze — enforcing role-based access.
#[derive(Accounts)]
#[instruction(params: InitializeParams)]
pub struct Initialize<'info> {
    /// The authority creating this stablecoin (becomes master authority).
    #[account(mut)]
    pub authority: Signer<'info>,

    /// The stablecoin configuration PDA.
    /// Seeds: ["config", mint.key()] — one config per mint.
    #[account(
        init,
        payer = authority,
        space = StablecoinConfig::space(),
        seeds = [b"config", mint.key().as_ref()],
        bump,
    )]
    pub config: Account<'info, StablecoinConfig>,

    /// The role manager PDA.
    /// Seeds: ["roles", config.key()] — linked to the config.
    #[account(
        init,
        payer = authority,
        space = RoleManager::space(),
        seeds = [b"roles", config.key().as_ref()],
        bump,
    )]
    pub role_manager: Account<'info, RoleManager>,

    /// The Token-2022 mint account.
    /// Must be a fresh keypair — we create the mint in this instruction.
    /// CHECK: We validate and initialize this as a Token-2022 mint via CPI.
    #[account(mut)]
    pub mint: Signer<'info>,

    /// Token-2022 program (NOT the legacy token program).
    pub token_program: Interface<'info, TokenInterface>,

    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

/// Event emitted when a stablecoin is initialized.
#[event]
pub struct StablecoinInitialized {
    pub config: Pubkey,
    pub mint: Pubkey,
    pub authority: Pubkey,
    pub name: String,
    pub symbol: String,
    pub decimals: u8,
    pub preset: String,
    pub enable_permanent_delegate: bool,
    pub enable_transfer_hook: bool,
    pub enable_confidential_transfers: bool,
    pub default_account_frozen: bool,
}

pub fn handler(ctx: Context<Initialize>, params: InitializeParams) -> Result<()> {
    // ── Step 1: Validate input ──────────────────────────────────────
    require!(
        params.name.len() <= 32,
        crate::errors::SssError::NameTooLong
    );
    require!(
        params.symbol.len() <= 10,
        crate::errors::SssError::SymbolTooLong
    );
    require!(params.uri.len() <= 200, crate::errors::SssError::UriTooLong);

    // ── Step 2: Determine which extensions to enable ────────────────
    //
    // Token-2022 extensions must be declared at mint creation time.
    // They can't be added later. This is why feature flags are immutable.
    //
    // SSS-1: MetadataPointer + TokenMetadata + MintCloseAuthority
    // SSS-2: + PermanentDelegate + TransferHook + DefaultAccountState
    // SSS-3: + ConfidentialTransferMint (experimental)

    let mut extension_types: Vec<ExtensionType> = vec![
        ExtensionType::MetadataPointer,    // Points to on-chain metadata
        ExtensionType::MintCloseAuthority, // Allows closing the mint to reclaim rent
    ];

    if params.enable_permanent_delegate {
        extension_types.push(ExtensionType::PermanentDelegate);
    }

    if params.enable_transfer_hook {
        extension_types.push(ExtensionType::TransferHook);
    }

    if params.default_account_frozen {
        extension_types.push(ExtensionType::DefaultAccountState);
    }

    if params.enable_confidential_transfers {
        extension_types.push(ExtensionType::ConfidentialTransferMint);
    }

    // ── Step 3: Calculate mint account size with extensions ──────────
    //
    // Token-2022 mints have variable size depending on enabled extensions.
    // We need to allocate the right amount of space upfront.
    //
    // IMPORTANT: token_metadata::initialize will realloc the account to
    // store metadata (name, symbol, uri). We must pre-fund enough lamports
    // to cover the final post-metadata size, otherwise the transaction
    // fails with "insufficient funds for rent".
    let base_space = ExtensionType::try_calculate_account_len::<Mint>(&extension_types)
        .map_err(|_| crate::errors::SssError::InvalidDecimals)?;

    // Calculate the additional space Token-2022 will need for the metadata
    // TLV entry that gets written during token_metadata::initialize.
    // Layout: TLV discriminator (8) + length (4) + update_authority (33) +
    //         mint (32) + name (4+len) + symbol (4+len) + uri (4+len) +
    //         additional_metadata vec len (4)
    let metadata_space = 8
        + 4
        + 33
        + 32
        + (4 + params.name.len())
        + (4 + params.symbol.len())
        + (4 + params.uri.len())
        + 4;

    // Create the account with base_space but fund for the full final size.
    // Token-2022 handles realloc internally during metadata initialize.
    let space = base_space;
    let rent = &ctx.accounts.rent;
    let lamports = rent.minimum_balance(base_space + metadata_space);

    // ── Step 4: Create the mint account ─────────────────────────────
    //
    // We use invoke (not CPI) to create the account owned by Token-2022.
    // This is a low-level SystemProgram::CreateAccount call.
    invoke(
        &anchor_lang::solana_program::system_instruction::create_account(
            ctx.accounts.authority.key,
            ctx.accounts.mint.key,
            lamports,
            space as u64,
            ctx.accounts.token_program.key,
        ),
        &[
            ctx.accounts.authority.to_account_info(),
            ctx.accounts.mint.to_account_info(),
            ctx.accounts.system_program.to_account_info(),
        ],
    )?;

    // ── Step 5: Initialize extensions BEFORE InitializeMint ─────────
    //
    // CRITICAL: Token-2022 requires extensions to be initialized
    // BEFORE the mint itself. Order matters!

    // 5a. MetadataPointer — points to the mint itself (self-referential)
    //     This tells clients "the metadata is on THIS account"
    invoke(
        &spl_token_2022::extension::metadata_pointer::instruction::initialize(
            ctx.accounts.token_program.key,
            ctx.accounts.mint.key,
            Some(ctx.accounts.config.key()), // authority over metadata pointer
            Some(*ctx.accounts.mint.key),    // metadata address = the mint itself
        )?,
        &[ctx.accounts.mint.to_account_info()],
    )?;

    // 5b. MintCloseAuthority — allows the config PDA to close the mint
    invoke(
        &token_instruction::initialize_mint_close_authority(
            ctx.accounts.token_program.key,
            ctx.accounts.mint.key,
            Some(&ctx.accounts.config.key()),
        )?,
        &[ctx.accounts.mint.to_account_info()],
    )?;

    // 5c. PermanentDelegate (SSS-2) — the config PDA becomes the
    //     permanent delegate, allowing it to transfer/burn from ANY
    //     token account. This is what enables the seize instruction.
    if params.enable_permanent_delegate {
        invoke(
            &token_instruction::initialize_permanent_delegate(
                ctx.accounts.token_program.key,
                ctx.accounts.mint.key,
                &ctx.accounts.config.key(),
            )?,
            &[ctx.accounts.mint.to_account_info()],
        )?;
    }

    // 5d. DefaultAccountState (SSS-2) — new accounts start frozen.
    //     The issuer must explicitly thaw each account before it can
    //     receive transfers. Standard for compliant stablecoins.
    if params.default_account_frozen {
        invoke(
            &spl_token_2022::extension::default_account_state::instruction::initialize_default_account_state(
                ctx.accounts.token_program.key,
                ctx.accounts.mint.key,
                &spl_token_2022::state::AccountState::Frozen,
            )?,
            &[ctx.accounts.mint.to_account_info()],
        )?;
    }

    // 5e. TransferHook (SSS-2) — enables on-transfer validation
    //     via the transfer-hook program for blacklist enforcement.
    if params.enable_transfer_hook {
        // Transfer hook program ID — deployed separately
        let transfer_hook_program_id: SolPubkey = "8nWGGHT4kkuvtY8NqXeYEdiyC79qQ2taS82UGwmfdKgu"
            .parse()
            .unwrap();
        invoke(
            &spl_token_2022::extension::transfer_hook::instruction::initialize(
                ctx.accounts.token_program.key,
                ctx.accounts.mint.key,
                Some(ctx.accounts.config.key()),
                Some(transfer_hook_program_id),
            )?,
            &[ctx.accounts.mint.to_account_info()],
        )?;
    }

    // 5f. ConfidentialTransferMint (SSS-3) — enables private transfer amounts
    //     Auto-approve mode: new accounts are automatically approved for
    //     confidential transfers without needing a separate approval tx.
    if params.enable_confidential_transfers {
        invoke(
            &spl_token_2022::extension::confidential_transfer::instruction::initialize_mint(
                ctx.accounts.token_program.key,
                ctx.accounts.mint.key,
                Some(ctx.accounts.config.key()),  // CT authority = config PDA
                true,                               // auto_approve_new_accounts
                None,                               // no auditor ElGamal pubkey
            )?,
            &[ctx.accounts.mint.to_account_info()],
        )?;
    }

    // ── Step 6: Initialize the mint itself ───────────────────────────
    //
    // The config PDA is both the mint authority and freeze authority.
    // This means ONLY the program can mint tokens or freeze accounts,
    // and it will check roles before allowing either operation.
    invoke(
        &token_instruction::initialize_mint2(
            ctx.accounts.token_program.key,
            ctx.accounts.mint.key,
            &ctx.accounts.config.key(), // mint authority = config PDA
            Some(&ctx.accounts.config.key()), // freeze authority = config PDA
            params.decimals,
        )?,
        &[ctx.accounts.mint.to_account_info()],
    )?;

    // ── Step 7: Initialize token metadata on the mint ───────────────
    //
    // Since we use MetadataPointer pointing to the mint itself,
    // we store the metadata directly on the mint account using
    // the TokenMetadata extension. No separate Metaplex account needed!
    //
    // We use `spl_token_metadata_interface` — a separate crate from
    // spl-token-2022 that provides the metadata instruction builders.
    invoke_signed(
        &spl_token_metadata_interface::instruction::initialize(
            ctx.accounts.token_program.key,
            ctx.accounts.mint.key,
            &ctx.accounts.config.key(), // update authority
            ctx.accounts.mint.key,      // metadata account = mint
            &ctx.accounts.config.key(), // mint authority (required signer)
            params.name.clone(),
            params.symbol.clone(),
            params.uri.clone(),
        ),
        &[
            ctx.accounts.mint.to_account_info(),
            ctx.accounts.config.to_account_info(),
        ],
        &[&[
            b"config",
            ctx.accounts.mint.key.as_ref(),
            &[ctx.bumps.config],
        ]],
    )?;

    // ── Step 8: Populate config account ─────────────────────────────

    let config = &mut ctx.accounts.config;
    config.authority = ctx.accounts.authority.key();
    config.mint = ctx.accounts.mint.key();
    config.name = params.name.clone();
    config.symbol = params.symbol.clone();
    config.uri = params.uri.clone();
    config.decimals = params.decimals;
    config.is_paused = false;
    config.total_minted = 0;
    config.total_burned = 0;
    config.enable_permanent_delegate = params.enable_permanent_delegate;
    config.enable_transfer_hook = params.enable_transfer_hook;
    config.enable_confidential_transfers = params.enable_confidential_transfers;
    config.default_account_frozen = params.default_account_frozen;
    config.bump = ctx.bumps.config;

    // ── Step 9: Populate role manager ───────────────────────────────

    let role_manager = &mut ctx.accounts.role_manager;
    role_manager.config = config.key();
    role_manager.master_authority = ctx.accounts.authority.key();
    role_manager.pauser = params.pauser;
    role_manager.minters = Vec::new();
    role_manager.burners = vec![ctx.accounts.authority.key()];
    role_manager.blacklister = params.blacklister.unwrap_or(ctx.accounts.authority.key());
    role_manager.seizer = params.seizer.unwrap_or(ctx.accounts.authority.key());
    role_manager.bump = ctx.bumps.role_manager;

    // ── Step 10: Determine preset name for the event ────────────────

    let preset = if params.enable_confidential_transfers {
        "SSS-3"
    } else if params.enable_permanent_delegate && params.enable_transfer_hook {
        "SSS-2"
    } else {
        "SSS-1"
    };

    emit!(StablecoinInitialized {
        config: config.key(),
        mint: config.mint,
        authority: config.authority,
        name: config.name.clone(),
        symbol: config.symbol.clone(),
        decimals: config.decimals,
        preset: preset.to_string(),
        enable_permanent_delegate: config.enable_permanent_delegate,
        enable_transfer_hook: config.enable_transfer_hook,
        enable_confidential_transfers: config.enable_confidential_transfers,
        default_account_frozen: config.default_account_frozen,
    });

    msg!(
        "Initialized {} stablecoin: {} ({})",
        preset,
        config.name,
        config.symbol
    );

    Ok(())
}
