use anchor_lang::prelude::*;
use anchor_spl::token_interface::{self, Mint, MintTo, TokenAccount, TokenInterface};

use crate::constants::*;
use crate::error::SssError;
use crate::events::TokensMinted;
use crate::state::{Role, RoleAccount, StablecoinConfig};

/// Known Pyth v2 oracle program IDs.
/// Validates price feed ownership to prevent forged oracle accounts.
const PYTH_V2_MAINNET: Pubkey = anchor_lang::pubkey!("FsJ3A3u2vn5cTVofAjvy6y5kwABJAqYWpe4975bi2epH");
const PYTH_V2_DEVNET: Pubkey = anchor_lang::pubkey!("gSbePebfvPy7tRqimPoVecS2UsBvYv46ynrzWocc92s");

#[derive(Accounts)]
pub struct MintTokens<'info> {
    pub minter: Signer<'info>,

    #[account(
        mut,
        seeds = [SSS_CONFIG_SEED, mint.key().as_ref()],
        bump = config.bump,
        constraint = !config.paused @ SssError::Paused,
    )]
    pub config: Account<'info, StablecoinConfig>,

    /// Minter role PDA — its existence proves authorization.
    #[account(
        seeds = [
            SSS_ROLE_SEED,
            config.key().as_ref(),
            minter.key().as_ref(),
            &[Role::Minter.as_u8()],
        ],
        bump = minter_role.bump,
    )]
    pub minter_role: Account<'info, RoleAccount>,

    #[account(
        mut,
        constraint = config.mint == mint.key() @ SssError::MintMismatch,
    )]
    pub mint: InterfaceAccount<'info, Mint>,

    #[account(
        mut,
        token::mint = mint,
    )]
    pub to: InterfaceAccount<'info, TokenAccount>,

    pub token_program: Interface<'info, TokenInterface>,
}

pub fn handler_mint_tokens(ctx: Context<MintTokens>, amount: u64) -> Result<()> {
    require!(amount > 0, SssError::ZeroAmount);

    // Capture account infos before mutable borrow of config
    let config_info = ctx.accounts.config.to_account_info();
    let mint_info = ctx.accounts.mint.to_account_info();
    let to_info = ctx.accounts.to.to_account_info();
    let token_program_info = ctx.accounts.token_program.to_account_info();
    let mint_key = ctx.accounts.mint.key();
    let to_key = ctx.accounts.to.key();
    let minter_key = ctx.accounts.minter.key();
    let decimals = ctx.accounts.mint.decimals;

    let config = &mut ctx.accounts.config;

    // Oracle-aware supply cap check:
    // If remaining_accounts[0] is a price feed, adjust the supply cap from
    // USD-denominated to token-denominated using the oracle price.
    // This is backward-compatible — omitting the oracle uses the raw cap.
    let effective_cap = if !ctx.remaining_accounts.is_empty() {
        let price_feed = &ctx.remaining_accounts[0];
        adjust_cap_with_oracle(config.supply_cap, price_feed, decimals)?
    } else {
        config.supply_cap
    };

    // Check supply cap (oracle-adjusted or raw)
    let can_mint = match effective_cap {
        Some(cap) => {
            let new_supply = config.current_supply()
                .checked_add(amount)
                .ok_or(SssError::ArithmeticOverflow)?;
            new_supply <= cap
        }
        None => config.current_supply().checked_add(amount).is_some(),
    };
    require!(can_mint, SssError::SupplyCapExceeded);

    config.total_minted = config
        .total_minted
        .checked_add(amount)
        .ok_or(SssError::ArithmeticOverflow)?;

    let signer_seeds: &[&[&[u8]]] = &[&[
        SSS_CONFIG_SEED,
        mint_key.as_ref(),
        &[config.bump],
    ]];

    let cpi_accounts = MintTo {
        mint: mint_info,
        to: to_info,
        authority: config_info,
    };
    let cpi_ctx = CpiContext::new(token_program_info, cpi_accounts)
        .with_signer(signer_seeds);

    token_interface::mint_to(cpi_ctx, amount)?;

    emit!(TokensMinted {
        mint: mint_key,
        to: to_key,
        amount,
        minter: minter_key,
        new_supply: config.current_supply(),
    });

    Ok(())
}

/// Adjust a USD-denominated supply cap to token units using an oracle price feed.
///
/// Compatible with Pyth v2 price accounts:
///   - Exponent (i32) at byte offset 20
///   - Aggregate price (i64) at byte offset 208
///
/// If no supply cap is set, returns None (unlimited).
/// If the price feed is invalid or price is non-positive, returns an error.
fn adjust_cap_with_oracle(
    usd_cap: Option<u64>,
    price_feed: &AccountInfo,
    mint_decimals: u8,
) -> Result<Option<u64>> {
    let Some(cap) = usd_cap else {
        return Ok(None);
    };

    // Validate price feed is owned by a known Pyth oracle program.
    // Without this check, an attacker could pass a forged account with
    // crafted data at the expected offsets to manipulate the supply cap.
    let owner = price_feed.owner;
    require!(
        *owner == PYTH_V2_MAINNET || *owner == PYTH_V2_DEVNET,
        SssError::InvalidOracleData
    );

    let data = price_feed.try_borrow_data()
        .map_err(|_| error!(SssError::InvalidOracleData))?;
    require!(data.len() >= 216, SssError::InvalidOracleData);

    // Pyth v2: exponent at offset 20 (i32 LE), aggregate price at offset 208 (i64 LE)
    let expo = i32::from_le_bytes(data[20..24].try_into().unwrap());
    let price = i64::from_le_bytes(data[208..216].try_into().unwrap());
    require!(price > 0, SssError::InvalidOraclePrice);

    // Convert USD cap to token amount:
    //   token_cap = cap * 10^mint_decimals / (price * 10^expo)
    //
    // When expo < 0 (typical, e.g., -8):
    //   token_cap = cap * 10^decimals * 10^|expo| / price
    //
    // When expo >= 0 (rare):
    //   token_cap = cap * 10^decimals / (price * 10^expo)
    let price_u128 = price as u128;
    let decimals_pow = 10u128.pow(mint_decimals as u32);

    let token_cap = if expo < 0 {
        let abs_expo = expo.unsigned_abs();
        let numerator = (cap as u128)
            .checked_mul(decimals_pow)
            .and_then(|v| v.checked_mul(10u128.pow(abs_expo)))
            .ok_or(error!(SssError::ArithmeticOverflow))?;
        numerator
            .checked_div(price_u128)
            .ok_or(error!(SssError::ArithmeticOverflow))?
    } else {
        let expo_pow = 10u128.pow(expo as u32);
        let numerator = (cap as u128)
            .checked_mul(decimals_pow)
            .ok_or(error!(SssError::ArithmeticOverflow))?;
        let denominator = price_u128
            .checked_mul(expo_pow)
            .ok_or(error!(SssError::ArithmeticOverflow))?;
        numerator
            .checked_div(denominator)
            .ok_or(error!(SssError::ArithmeticOverflow))?
    };

    // Safe downcast — if it exceeds u64, cap at u64::MAX (effectively unlimited)
    Ok(Some(token_cap.min(u64::MAX as u128) as u64))
}
