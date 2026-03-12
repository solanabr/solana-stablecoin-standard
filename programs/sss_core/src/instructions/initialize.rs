use anchor_lang::prelude::*;
use anchor_lang::solana_program::program::invoke;
use anchor_lang::solana_program::system_instruction;
use anchor_spl::{
    token_interface::{Mint, TokenInterface},
    token_2022::{self, spl_token_2022},
};
use spl_token_2022::extension::ExtensionType;

use crate::state::StablecoinConfig;
use crate::events::StablecoinInitializedEvent;

#[derive(Accounts)]
#[instruction(decimals: u8, enable_permanent_delegate: bool, enable_transfer_hook: bool, enable_confidential_transfers: bool, oracle_feed: Option<Pubkey>, name: String, symbol: String, uri: String)]
pub struct Initialize<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    #[account(
        init,
        payer = payer,
        space = 8 + StablecoinConfig::INIT_SPACE,
        seeds = [b"config"],
        bump
    )]
    pub config: Account<'info, StablecoinConfig>,

    /// CHECK: Создается мануально
    #[account(mut, signer)]
    pub mint: AccountInfo<'info>,

    /// CHECK: Опциональный адрес программы Transfer Hook
    pub transfer_hook_program_id: Option<UncheckedAccount<'info>>,

    pub token_program: Interface<'info, TokenInterface>,
    pub system_program: Program<'info, System>,
}

pub fn process_initialize(
    ctx: Context<Initialize>,
    decimals: u8,
    enable_permanent_delegate: bool,
    enable_transfer_hook: bool,
    enable_confidential_transfers: bool,
    oracle_feed: Option<Pubkey>,
    name: String,
    symbol: String,
    _uri: String,
) -> Result<()> {
    let config = &mut ctx.accounts.config;
    let config_key = config.key();

    // let extension_types = Vec::new();
    // let mint_len = ExtensionType::try_calculate_account_len::<spl_token_2022::state::Mint>(&extension_types)
    //     .map_err(|_| ProgramError::InvalidAccountData)?;

    // let rent = Rent::get()?;
    // let lamports = rent.minimum_balance(mint_len);

    // invoke(
    //     &system_instruction::create_account(
    //         ctx.accounts.payer.key,
    //         ctx.accounts.mint.key,
    //         lamports,
    //         mint_len as u64,
    //         &ctx.accounts.token_program.key(),
    //     ),
    //     &[
    //         ctx.accounts.payer.to_account_info(),
    //         ctx.accounts.mint.to_account_info(),
    //     ],
    // )?;

    // invoke(
    //     &token_2022::spl_token_2022::instruction::initialize_mint2(
    //         &ctx.accounts.token_program.key(),
    //         ctx.accounts.mint.key,
    //         &config_key,
    //         Some(&config_key),
    //         decimals,
    //     )?,
    //     &[ctx.accounts.mint.to_account_info()],
    // )?;

    // if ctx.accounts.transfer_hook_program_id.is_some() {
    //     let hook_program = ctx.accounts.transfer_hook_program_id.as_ref().unwrap();
    //     let init_hook_ix = token_2022::spl_token_2022::extension::transfer_hook::instruction::initialize(
    //         &ctx.accounts.token_program.key(),
    //         &ctx.accounts.mint.key(),
    //         Some(config_key),
    //         Some(hook_program.key()),
    //     )?;
    //     invoke(&init_hook_ix, &[ctx.accounts.mint.to_account_info()])?;
    // }

    config.authority = ctx.accounts.payer.key();
    config.mint = ctx.accounts.mint.key();
    config.name = name.clone();
    config.symbol = symbol.clone();
    config.uri = _uri;
    config.decimals = decimals;
    config.is_paused = false;
    config.enable_permanent_delegate = enable_permanent_delegate;
    config.enable_transfer_hook = enable_transfer_hook;
    config.minter_authority = ctx.accounts.payer.key();
    config.burner_authority = ctx.accounts.payer.key();
    config.freezer_authority = ctx.accounts.payer.key();
    config.seizer_authority = ctx.accounts.payer.key();
    // --- SSS-3 ---
    config.enable_confidential_transfers = enable_confidential_transfers;
    config.auditor = ctx.accounts.payer.key(); // Аудитором по умолчанию делаем создателя (Admin)
    config.oracle_feed = oracle_feed;
    config.bump = ctx.bumps.config;

    emit!(StablecoinInitializedEvent {
        mint: config.mint,
        authority: config.authority,
        name,
        symbol,
    });

    Ok(())
}