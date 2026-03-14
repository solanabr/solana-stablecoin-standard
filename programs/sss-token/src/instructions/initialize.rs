use anchor_lang::prelude::*;
use anchor_spl::token_interface::TokenInterface;
use spl_token_2022::extension::ExtensionType;
use spl_token_2022::state::Mint as SplMint;
use spl_token_metadata_interface::instruction::initialize as init_metadata;
use spl_token_metadata_interface::state::TokenMetadata;

use crate::state::*;
use crate::errors::SssError;

pub fn handler(ctx: Context<Initialize>, params: InitializeParams) -> Result<()> {
    require!(params.name.len() <= StablecoinConfig::MAX_NAME_LEN, SssError::NameTooLong);
    require!(params.symbol.len() <= StablecoinConfig::MAX_SYMBOL_LEN, SssError::SymbolTooLong);

    let bump = ctx.bumps.config;
    let mint_key = ctx.accounts.mint.key();
    let config_key = ctx.accounts.config.key();

    let config_seeds: &[&[u8]] = &[b"config", mint_key.as_ref(), &[bump]];
    let signer_seeds = &[config_seeds];

    let extensions = build_extensions(&params);
    let base_space = match ExtensionType::try_calculate_account_len::<SplMint>(&extensions) {
        Ok(len) => len,
        Err(_) => {
            msg!("Token-2022 mint length calculation failed; using fallback base space");
            1024usize
        }
    };

    let space = base_space;

    let lamports = Rent::get()?.minimum_balance(space);

    anchor_lang::system_program::create_account(
        CpiContext::new(
            ctx.accounts.system_program.to_account_info(),
            anchor_lang::system_program::CreateAccount {
                from: ctx.accounts.authority.to_account_info(),
                to: ctx.accounts.mint.to_account_info(),
            },
        ),
        lamports,
        space as u64,
        &ctx.accounts.token_program.key(),
    )?;

    let metadata_template = TokenMetadata {
        update_authority: Some(config_key)
            .try_into()
            .map_err(|_| SssError::Overflow)?,
        mint: mint_key,
        name: params.name.clone(),
        symbol: params.symbol.clone(),
        uri: params.uri.clone(),
        additional_metadata: vec![],
    };

    let metadata_tlv_size = metadata_template
        .tlv_size_of()
        .map_err(|_| SssError::Overflow)?;

    let future_size = space
        .checked_add(metadata_tlv_size)
        .ok_or(SssError::Overflow)?;

    let future_rent = Rent::get()?.minimum_balance(future_size);
    if future_rent > lamports {
        let topup = future_rent
            .checked_sub(lamports)
            .ok_or(SssError::Overflow)?;

        anchor_lang::system_program::transfer(
            CpiContext::new(
                ctx.accounts.system_program.to_account_info(),
                anchor_lang::system_program::Transfer {
                    from: ctx.accounts.authority.to_account_info(),
                    to: ctx.accounts.mint.to_account_info(),
                },
            ),
            topup,
        )?;
    }

    init_mint_extensions(&ctx, &params, config_key, signer_seeds)?;

    anchor_spl::token_2022::initialize_mint2(
        CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            anchor_spl::token_2022::InitializeMint2 {
                mint: ctx.accounts.mint.to_account_info(),
            },
        ),
        params.decimals,
        &config_key,
        Some(&config_key),
    )?;

    let token_prog_key = ctx.accounts.token_program.key();
    let metadata_ix = init_metadata(
        &token_prog_key,
        &mint_key,
        &config_key,
        &mint_key,
        &config_key,
        params.name.clone(),
        params.symbol.clone(),
        params.uri.clone(),
    );
    anchor_lang::solana_program::program::invoke_signed(
        &metadata_ix,
        &[
            ctx.accounts.mint.to_account_info(),
            ctx.accounts.config.to_account_info(),
        ],
        signer_seeds,
    )?;

    let config = &mut ctx.accounts.config;
    config.authority = ctx.accounts.authority.key();
    config.mint = mint_key;
    config.preset = params.preset;
    config.name = params.name.clone();
    config.symbol = params.symbol.clone();
    config.decimals = params.decimals;
    config.is_paused = false;
    config.supply_cap = params.supply_cap;
    config.total_minted = 0;
    config.total_burned = 0;
    config.backing_type = params.backing_type;
    config.banking_rail = params.banking_rail;
    config.reserve_account = None;
    config.oracle = params.oracle;
    config.bump = bump;

    msg!("Initialized {:?} stablecoin: {} | Backing: {:?} | Rail: {:?}", 
        params.preset, mint_key, params.backing_type, params.banking_rail);
    Ok(())
}

fn build_extensions(params: &InitializeParams) -> Vec<ExtensionType> {
    let mut exts = vec![
        ExtensionType::MetadataPointer,
        ExtensionType::MintCloseAuthority,
    ];

    match params.preset {
        Preset::Sss1 => {}
        Preset::Sss2 => {
            exts.push(ExtensionType::PermanentDelegate);
            if params.hook_program_id.is_some() {
                exts.push(ExtensionType::TransferHook);
            }
        }
        Preset::Sss3 => {
            exts.push(ExtensionType::PermanentDelegate);
            if params.hook_program_id.is_some() {
                exts.push(ExtensionType::TransferHook);
            }
            exts.push(ExtensionType::ConfidentialTransferMint);
        }
    }

    exts
}

fn init_mint_extensions(
    ctx: &Context<Initialize>,
    params: &InitializeParams,
    config_key: Pubkey,
    signer_seeds: &[&[&[u8]]],
) -> Result<()> {
    let mint = ctx.accounts.mint.to_account_info();
    let token_prog = ctx.accounts.token_program.key();

    let ix = spl_token_2022::extension::metadata_pointer::instruction::initialize(
        &token_prog,
        &mint.key(),
        Some(config_key),
        Some(mint.key()),
    )?;
    anchor_lang::solana_program::program::invoke(&ix, &[mint.clone()])?;

    let ix = spl_token_2022::instruction::initialize_mint_close_authority(
        &token_prog,
        &mint.key(),
        Some(&config_key),
    )?;
    anchor_lang::solana_program::program::invoke(&ix, &[mint.clone()])?;

    if matches!(params.preset, Preset::Sss2 | Preset::Sss3) {
        let ix = spl_token_2022::instruction::initialize_permanent_delegate(
            &token_prog,
            &mint.key(),
            &config_key,
        )?;
        anchor_lang::solana_program::program::invoke(&ix, &[mint.clone()])?;

        if let Some(hook_id) = params.hook_program_id {
            let ix = spl_token_2022::extension::transfer_hook::instruction::initialize(
                &token_prog,
                &mint.key(),
                Some(config_key),
                Some(hook_id),
            )?;
            anchor_lang::solana_program::program::invoke_signed(
                &ix,
                &[mint.clone(), ctx.accounts.config.to_account_info()],
                signer_seeds,
            )?;
        }

        if params.preset == Preset::Sss3 {
            let ix = spl_token_2022::extension::confidential_transfer::instruction::initialize_mint(
                &token_prog,
                &mint.key(),
                Some(config_key),
                true,
                None,
            )?;
            anchor_lang::solana_program::program::invoke(&ix, &[mint.clone()])?;
        }
    }

    Ok(())
}

#[derive(Accounts)]
#[instruction(params: InitializeParams)]
pub struct Initialize<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    /// CHECK: created via CPI, not via anchor init
    #[account(mut, signer)]
    pub mint: AccountInfo<'info>,

    #[account(
        init,
        payer = authority,
        space = StablecoinConfig::SPACE,
        seeds = [b"config", mint.key().as_ref()],
        bump,
    )]
    pub config: Account<'info, StablecoinConfig>,

    pub token_program: Interface<'info, TokenInterface>,
    pub system_program: Program<'info, System>,
}
