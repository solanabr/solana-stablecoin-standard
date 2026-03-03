use anchor_lang::prelude::*;
use anchor_lang::solana_program::program::invoke_signed;
use anchor_spl::token_2022;
use spl_token_metadata_interface::instruction::initialize as initialize_metadata;

use crate::error::SssError;
use crate::events::MetadataSet;
use crate::state::StablecoinConfig;

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct SetMetadataParams {
    pub name: String,
    pub symbol: String,
    pub uri: String,
}

#[derive(Accounts)]
pub struct SetMetadata<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,

    /// CHECK: Mint account (Token-2022), metadata pointer points to self
    #[account(mut)]
    pub mint: AccountInfo<'info>,

    #[account(
        has_one = admin @ SssError::Unauthorized,
        has_one = mint,
        seeds = [b"sss_config", mint.key().as_ref()],
        bump = config.bump,
    )]
    pub config: Account<'info, StablecoinConfig>,

    pub token_program: Program<'info, token_2022::Token2022>,
}

pub fn handler(ctx: Context<SetMetadata>, params: SetMetadataParams) -> Result<()> {
    require!(!ctx.accounts.config.paused, SssError::Paused);
    require!(params.name.len() <= crate::utils::MAX_NAME_LEN, SssError::NameTooLong);
    require!(params.symbol.len() <= crate::utils::MAX_SYMBOL_LEN, SssError::SymbolTooLong);
    require!(params.uri.len() <= crate::utils::MAX_URI_LEN, SssError::UriTooLong);

    let mint = &ctx.accounts.mint;
    let config = &ctx.accounts.config;
    let token_program = &ctx.accounts.token_program;

    // Config PDA seeds for signing (config PDA is the mint_authority)
    let cs = crate::utils::ConfigSeeds::new(config);
    let seeds = cs.as_seeds();
    let signer_seeds: &[&[&[u8]]] = &[&seeds];

    // Token-2022 initialize_metadata:
    // - metadata account = mint (metadata pointer points to self)
    // - update_authority = config PDA (will manage metadata updates)
    // - mint = mint
    // - mint_authority = config PDA (set during initialize_mint2)
    //
    // This will realloc the mint account to fit the metadata.
    // The extra lamports were pre-funded in create_mint.
    let name_clone = params.name.clone();
    let symbol_clone = params.symbol.clone();
    let uri_clone = params.uri.clone();

    invoke_signed(
        &initialize_metadata(
            &token_program.key(),
            &mint.key(),
            &config.key(),
            &mint.key(),
            &config.key(),
            params.name,
            params.symbol,
            params.uri,
        ),
        &[
            mint.to_account_info(),
            config.to_account_info(),
        ],
        signer_seeds,
    )?;

    emit!(MetadataSet {
        config: config.key(),
        mint: mint.key(),
        name: name_clone,
        symbol: symbol_clone,
        uri: uri_clone,
        set_by: ctx.accounts.admin.key(),
    });

    Ok(())
}
