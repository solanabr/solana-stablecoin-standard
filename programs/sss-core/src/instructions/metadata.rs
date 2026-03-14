use anchor_lang::prelude::*;
use anchor_lang::solana_program::program::invoke_signed;

use crate::constants::*;
use crate::error::StablecoinError;
use crate::events::MetadataUpdated;
use crate::state::StablecoinConfig;

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct UpdateMetadataInput {
    pub field: String,
    pub value: String,
}

#[derive(Accounts)]
pub struct SetMetadata<'info> {
    #[account(
        constraint = authority.key() == config.authority @ StablecoinError::Unauthorized,
    )]
    pub authority: Signer<'info>,

    #[account(
        seeds = [CONFIG_SEED, config.mint.as_ref()],
        bump = config.bump,
    )]
    pub config: Account<'info, StablecoinConfig>,

    /// CHECK: The mint account (metadata stored on mint for Token-2022)
    #[account(
        mut,
        constraint = mint.key() == config.mint @ StablecoinError::Unauthorized,
    )]
    pub mint: UncheckedAccount<'info>,

    /// CHECK: Token-2022 program
    #[account(address = anchor_spl::token_2022::ID)]
    pub token_program: UncheckedAccount<'info>,
}

/// Update a metadata field on the Token-2022 mint.
/// Supported fields: "name", "symbol", "uri", or any custom key.
pub fn set_metadata_handler(
    ctx: Context<SetMetadata>,
    input: UpdateMetadataInput,
) -> Result<()> {
    // Validate standard field lengths
    match input.field.as_str() {
        "name" => require!(input.value.len() <= MAX_NAME_LEN, StablecoinError::NameTooLong),
        "symbol" => require!(input.value.len() <= MAX_SYMBOL_LEN, StablecoinError::SymbolTooLong),
        "uri" => require!(input.value.len() <= MAX_URI_LEN, StablecoinError::UriTooLong),
        _ => {} // custom fields have no length limit here
    }

    let mint_key = ctx.accounts.config.mint;
    let bump = ctx.accounts.config.bump;
    let signer_seeds: &[&[&[u8]]] = &[&[
        CONFIG_SEED,
        mint_key.as_ref(),
        &[bump],
    ]];

    let field_name = input.field.clone();
    let field_value = input.value.clone();

    // Use spl_token_metadata_interface to update the field
    let update_ix = spl_token_metadata_interface::instruction::update_field(
        &anchor_spl::token_2022::ID,
        &ctx.accounts.mint.key(),
        &ctx.accounts.config.key(), // update authority = config PDA
        spl_token_metadata_interface::state::Field::Key(input.field),
        input.value,
    );

    invoke_signed(
        &update_ix,
        &[
            ctx.accounts.mint.to_account_info(),
            ctx.accounts.config.to_account_info(),
        ],
        signer_seeds,
    )?;

    emit!(MetadataUpdated {
        config: ctx.accounts.config.key(),
        mint: ctx.accounts.mint.key(),
        field: field_name,
        value: field_value,
    });

    Ok(())
}
