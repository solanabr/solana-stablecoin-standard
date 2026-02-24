use anchor_lang::prelude::*;
use anchor_spl::{
    token_2022::{
        spl_token_2022::{
            extension::{
                default_account_state::DefaultAccountState,
                metadata_pointer::MetadataPointer,
                mint_close_authority::MintCloseAuthority,
                permanent_delegate::PermanentDelegate,
                transfer_hook::TransferHook,
                ExtensionType,
            },
            state::AccountState,
        },
        Token2022,
    },
    token_interface::Mint,
};
use spl_token_2022::{
    extension::StateWithExtensionsMut,
    state::Mint as SplMint,
};

use crate::{
    errors::SssError,
    events::StablecoinInitialized,
    state::{StablecoinConfig, StablecoinState},
};

#[derive(Accounts)]
#[instruction(config: StablecoinConfig)]
pub struct Initialize<'info> {
    #[account(mut)]
    pub master_authority: Signer<'info>,

    /// The stablecoin's global state PDA
    #[account(
        init,
        payer = master_authority,
        space = StablecoinState::LEN,
        seeds = [b"stablecoin", mint.key().as_ref()],
        bump
    )]
    pub state: Account<'info, StablecoinState>,

    /// Token-2022 mint — created externally with correct extensions pre-allocated,
    /// then passed here for authority assignment.
    #[account(mut)]
    pub mint: Signer<'info>,

    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token2022>,
    pub rent: Sysvar<'info, Rent>,
}

pub fn handler(ctx: Context<Initialize>, config: StablecoinConfig) -> Result<()> {
    // Validate string lengths
    require!(config.name.len() <= 64, SssError::StringTooLong);
    require!(config.symbol.len() <= 16, SssError::StringTooLong);
    require!(config.uri.len() <= 200, SssError::StringTooLong);

    // SSS-2: transfer hook requires permanent delegate
    if config.enable_transfer_hook {
        require!(
            config.enable_permanent_delegate,
            SssError::ComplianceNotEnabled
        );
        require!(
            config.transfer_hook_program_id.is_some(),
            SssError::ComplianceNotEnabled
        );
    }

    let compliance_enabled = config.enable_permanent_delegate || config.enable_transfer_hook;

    let state = &mut ctx.accounts.state;
    state.master_authority = ctx.accounts.master_authority.key();
    state.pending_authority = None;
    state.mint = ctx.accounts.mint.key();
    state.name = config.name.clone();
    state.symbol = config.symbol.clone();
    state.uri = config.uri.clone();
    state.decimals = config.decimals;
    state.compliance_enabled = compliance_enabled;
    state.permanent_delegate_enabled = config.enable_permanent_delegate;
    state.transfer_hook_enabled = config.enable_transfer_hook;
    state.default_account_frozen = config.default_account_frozen;
    state.paused = false;
    state.total_minted = 0;
    state.total_burned = 0;
    state.pauser = None;
    state.burner = None;
    state.blacklister = None;
    state.seizer = None;
    state.transfer_hook_program_id = config.transfer_hook_program_id;
    state.bump = ctx.bumps.state;

    emit!(StablecoinInitialized {
        mint: ctx.accounts.mint.key(),
        master_authority: ctx.accounts.master_authority.key(),
        name: config.name,
        symbol: config.symbol,
        decimals: config.decimals,
        compliance_enabled,
        timestamp: Clock::get()?.unix_timestamp,
    });

    Ok(())
}