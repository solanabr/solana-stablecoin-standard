use anchor_lang::prelude::*;
use anchor_lang::solana_program::program::invoke_signed;
use anchor_spl::token_2022::Token2022;

use crate::{
    constants::CONFIG_SEED, error::StablecoinError, events::MetadataUpdated,
    state::StablecoinConfig,
};

#[derive(Accounts)]
pub struct UpdateMetadata<'info> {
    pub admin: Signer<'info>,

    #[account(
        mut,
        seeds = [CONFIG_SEED, config.mint.as_ref()],
        bump = config.bump,
        constraint = config.admin == admin.key() @ StablecoinError::Unauthorized,
        constraint = !config.paused @ StablecoinError::Paused,
    )]
    pub config: Account<'info, StablecoinConfig>,

    /// CHECK: The mint account containing token metadata
    #[account(
        mut,
        constraint = mint.key() == config.mint @ StablecoinError::Unauthorized,
    )]
    pub mint: UncheckedAccount<'info>,

    pub token_program: Program<'info, Token2022>,
}

pub fn handler(ctx: Context<UpdateMetadata>, field: String, value: String) -> Result<()> {
    let mint_key = ctx.accounts.config.mint;
    let config_bump = ctx.accounts.config.bump;
    let config_bump_bytes = [config_bump];
    let signer_seeds: &[&[u8]] = &[CONFIG_SEED, mint_key.as_ref(), &config_bump_bytes];

    // Use the token metadata interface to update the field
    let update_ix = spl_token_metadata_interface::instruction::update_field(
        &ctx.accounts.token_program.key(),
        &ctx.accounts.mint.key(),
        &ctx.accounts.config.key(),
        spl_token_metadata_interface::state::Field::Key(field.clone()),
        value.clone(),
    );

    invoke_signed(
        &update_ix,
        &[
            ctx.accounts.mint.to_account_info(),
            ctx.accounts.config.to_account_info(),
        ],
        &[signer_seeds],
    )?;

    // Update local config state if it's a known field
    let config = &mut ctx.accounts.config;
    match field.as_str() {
        "name" => {
            require!(
                value.len() <= StablecoinConfig::MAX_NAME_LEN,
                StablecoinError::NameTooLong
            );
            config.name = value.clone();
        }
        "symbol" => {
            require!(
                value.len() <= StablecoinConfig::MAX_SYMBOL_LEN,
                StablecoinError::SymbolTooLong
            );
            config.symbol = value.clone();
        }
        "uri" => {
            require!(
                value.len() <= StablecoinConfig::MAX_URI_LEN,
                StablecoinError::UriTooLong
            );
            config.uri = value.clone();
        }
        _ => {}
    }

    emit!(MetadataUpdated {
        config: config.key(),
        admin: ctx.accounts.admin.key(),
        field,
        value,
    });

    Ok(())
}
