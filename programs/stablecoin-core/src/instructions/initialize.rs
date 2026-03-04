use anchor_lang::prelude::*;
use anchor_spl::token_2022::{self, Token2022, InitializeMint2, SetAuthority};
use anchor_spl::associated_token::AssociatedToken;
use spl_token_2022::instruction::AuthorityType;

use crate::state::*;
use crate::errors::*;
use crate::StablecoinConfig;

#[derive(Accounts)]
#[instruction(config: StablecoinConfig)]
pub struct Initialize<'info> {
    #[account(
        init,
        payer = authority,
        space = StablecoinState::LEN,
        seeds = [b"stablecoin", mint.key().as_ref()],
        bump
    )]
    pub stablecoin_state: Account<'info, StablecoinState>,
    
    /// CHECK: Mint account will be initialized by Token-2022
    #[account(mut)]
    pub mint: Signer<'info>,
    
    #[account(mut)]
    pub authority: Signer<'info>,
    
    pub token_program: Program<'info, Token2022>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

pub fn handler(
    ctx: Context<Initialize>,
    config: StablecoinConfig,
) -> Result<()> {
    // Validate configuration
    require!(config.name.len() <= 32, StablecoinError::NameTooLong);
    require!(config.symbol.len() <= 10, StablecoinError::SymbolTooLong);
    require!(config.uri.len() <= 200, StablecoinError::UriTooLong);
    require!(config.decimals <= 9, StablecoinError::InvalidDecimals);
    
    let stablecoin_state = &mut ctx.accounts.stablecoin_state;
    let authority = &ctx.accounts.authority;
    
    // Initialize state
    stablecoin_state.master_authority = authority.key();
    stablecoin_state.mint = ctx.accounts.mint.key();
    
    // Convert strings to fixed-size byte arrays
    let mut name_bytes = [0u8; 32];
    let name_len = config.name.len().min(32);
    name_bytes[..name_len].copy_from_slice(&config.name.as_bytes()[..name_len]);
    stablecoin_state.name = name_bytes;
    
    let mut symbol_bytes = [0u8; 10];
    let symbol_len = config.symbol.len().min(10);
    symbol_bytes[..symbol_len].copy_from_slice(&config.symbol.as_bytes()[..symbol_len]);
    stablecoin_state.symbol = symbol_bytes;
    
    let mut uri_bytes = [0u8; 200];
    let uri_len = config.uri.len().min(200);
    uri_bytes[..uri_len].copy_from_slice(&config.uri.as_bytes()[..uri_len]);
    stablecoin_state.uri = uri_bytes;
    
    stablecoin_state.decimals = config.decimals;
    stablecoin_state.is_paused = false;
    stablecoin_state.total_minted = 0;
    stablecoin_state.total_burned = 0;
    
    // Set compliance flags
    stablecoin_state.compliance_enabled = 
        config.enable_permanent_delegate || config.enable_transfer_hook;
    stablecoin_state.permanent_delegate_enabled = config.enable_permanent_delegate;
    stablecoin_state.transfer_hook_enabled = config.enable_transfer_hook;
    stablecoin_state.default_account_frozen = config.default_account_frozen;
    
    stablecoin_state.bump = ctx.bumps.stablecoin_state;
    
    msg!("Stablecoin initialized: {} ({})", config.symbol, config.name);
    msg!("Mint: {}", stablecoin_state.mint);
    msg!("Compliance enabled: {}", stablecoin_state.compliance_enabled);
    msg!("Permanent delegate: {}", stablecoin_state.permanent_delegate_enabled);
    msg!("Transfer hook: {}", stablecoin_state.transfer_hook_enabled);
    
    Ok(())
}
