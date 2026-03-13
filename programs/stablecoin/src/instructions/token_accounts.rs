use anchor_lang::prelude::*;
use anchor_spl::token_2022::spl_token_2022::{
    extension::StateWithExtensions,
    state::{
    Account as SplTokenAccount,
    Mint as SplMint,
    },
};

use crate::errors::StablecoinError;

pub struct MintView {
    pub decimals: u8,
}

pub struct TokenAccountView {
    pub mint: Pubkey,
    pub amount: u64,
}

pub fn load_mint(
    account: &UncheckedAccount<'_>,
    token_program: &Pubkey,
) -> Result<MintView> {
    require_keys_eq!(*account.owner, *token_program, StablecoinError::InvalidMint);
    let data = account.try_borrow_data()?;
    let mint = StateWithExtensions::<SplMint>::unpack(&data)
        .map_err(|_| error!(StablecoinError::InvalidMint))?;
    Ok(MintView {
        decimals: mint.base.decimals,
    })
}

pub fn load_token_account(
    account: &UncheckedAccount<'_>,
    token_program: &Pubkey,
) -> Result<TokenAccountView> {
    require_keys_eq!(*account.owner, *token_program, StablecoinError::InvalidMint);
    let data = account.try_borrow_data()?;
    let token_account = StateWithExtensions::<SplTokenAccount>::unpack(&data)
        .map_err(|_| error!(StablecoinError::InvalidMint))?;
    Ok(TokenAccountView {
        mint: token_account.base.mint,
        amount: token_account.base.amount,
    })
}
