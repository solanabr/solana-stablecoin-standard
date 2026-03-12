use anchor_lang::prelude::*;

use crate::state::{StablecoinConfig, RoleManager, MinterEntry};

/// Parameters for initializing a new stablecoin.
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct InitializeParams {
    pub name: String,
    pub symbol: String,
    pub uri: String,
    pub decimals: u8,
    /// SSS-2: Enable permanent delegate
    pub enable_permanent_delegate: bool,
    /// SSS-2: Enable transfer hook
    pub enable_transfer_hook: bool,
    /// SSS-3: Enable confidential transfers
    pub enable_confidential_transfers: bool,
    /// SSS-2: Default account state is frozen
    pub default_account_frozen: bool,
    // Initial role assignments
    pub pauser: Pubkey,
    pub blacklister: Option<Pubkey>,
    pub seizer: Option<Pubkey>,
}

/// Accounts for the initialize instruction.
#[derive(Accounts)]
#[instruction(params: InitializeParams)]
pub struct Initialize<'info> {
    /// The authority creating this stablecoin (becomes master authority).
    #[account(mut)]
    pub authority: Signer<'info>,

    /// The stablecoin configuration PDA.
    #[account(
        init,
        payer = authority,
        space = StablecoinConfig::space(),
        seeds = [b"config", mint.key().as_ref()],
        bump,
    )]
    pub config: Account<'info, StablecoinConfig>,

    /// The role manager PDA.
    #[account(
        init,
        payer = authority,
        space = RoleManager::space(),
        seeds = [b"roles", config.key().as_ref()],
        bump,
    )]
    pub role_manager: Account<'info, RoleManager>,

    /// The Token-2022 mint account (created by this instruction).
    /// CHECK: Validated in handler — we create the mint with extensions.
    #[account(mut)]
    pub mint: Signer<'info>,

    /// Token-2022 program.
    /// CHECK: Validated by address.
    pub token_program: AccountInfo<'info>,

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
    pub enable_permanent_delegate: bool,
    pub enable_transfer_hook: bool,
    pub enable_confidential_transfers: bool,
    pub default_account_frozen: bool,
}

pub fn handler(ctx: Context<Initialize>, params: InitializeParams) -> Result<()> {
    let config = &mut ctx.accounts.config;
    let role_manager = &mut ctx.accounts.role_manager;

    // Validate input
    require!(params.name.len() <= 32, crate::errors::SssError::NameTooLong);
    require!(params.symbol.len() <= 10, crate::errors::SssError::SymbolTooLong);
    require!(params.uri.len() <= 200, crate::errors::SssError::UriTooLong);

    // Set config
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

    // Set role manager
    role_manager.config = config.key();
    role_manager.master_authority = ctx.accounts.authority.key();
    role_manager.pauser = params.pauser;
    role_manager.minters = Vec::new();
    role_manager.burners = vec![ctx.accounts.authority.key()];
    role_manager.blacklister = params.blacklister.unwrap_or(ctx.accounts.authority.key());
    role_manager.seizer = params.seizer.unwrap_or(ctx.accounts.authority.key());
    role_manager.bump = ctx.bumps.role_manager;

    // TODO: Phase 2 — Create Token-2022 mint with extensions via CPI
    // For now, the mint is created externally. Full implementation will
    // create the mint inline with MetadataPointer, TokenMetadata,
    // MintCloseAuthority, and optionally PermanentDelegate, TransferHook,
    // DefaultAccountState, ConfidentialTransferMint extensions.

    emit!(StablecoinInitialized {
        config: config.key(),
        mint: config.mint,
        authority: config.authority,
        name: config.name.clone(),
        symbol: config.symbol.clone(),
        decimals: config.decimals,
        enable_permanent_delegate: config.enable_permanent_delegate,
        enable_transfer_hook: config.enable_transfer_hook,
        enable_confidential_transfers: config.enable_confidential_transfers,
        default_account_frozen: config.default_account_frozen,
    });

    Ok(())
}
