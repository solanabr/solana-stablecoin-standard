use anchor_lang::prelude::*;
use anchor_spl::token_2022::{self, ThawAccount, FreezeAccount, Token2022};
use anchor_spl::token_interface::Mint;

// Token-2022 account layout constants
const TOKEN_ACCOUNT_STATE_OFFSET: usize = 108;
const FROZEN_STATE_VALUE: u8 = 2;

// Metadata field length limits
pub const MAX_NAME_LEN: usize = 32;
pub const MAX_SYMBOL_LEN: usize = 10;
pub const MAX_URI_LEN: usize = 200;

/// Holds config PDA signer seed data with proper lifetimes.
/// Usage:
/// ```ignore
/// let config_seeds = ConfigSeeds::new(&config);
/// let signer_seeds = config_seeds.as_signer_seeds();
/// ```
pub struct ConfigSeeds {
    pub mint_key: Pubkey,
    pub bump: [u8; 1],
}

impl ConfigSeeds {
    pub fn new(config: &crate::state::StablecoinConfig) -> Self {
        Self {
            mint_key: config.mint,
            bump: [config.bump],
        }
    }

    pub fn as_seeds(&self) -> [&[u8]; 3] {
        [b"sss_config", self.mint_key.as_ref(), &self.bump]
    }
}

/// Check if a Token-2022 account is in the Frozen state by reading the raw account data.
/// Returns false if the account data is too short to contain the state byte.
pub fn is_token_account_frozen(account: &AccountInfo) -> Result<bool> {
    let data = account.try_borrow_data()?;
    let frozen = data.len() > TOKEN_ACCOUNT_STATE_OFFSET
        && data[TOKEN_ACCOUNT_STATE_OFFSET] == FROZEN_STATE_VALUE;
    Ok(frozen)
}

/// Thaw a token account if it is currently frozen.
/// Returns whether the account was frozen (and thus thawed).
pub fn thaw_if_frozen<'info>(
    account: &AccountInfo<'info>,
    mint: &InterfaceAccount<'info, Mint>,
    authority: &AccountInfo<'info>,
    token_program: &Program<'info, Token2022>,
    signer_seeds: &[&[&[u8]]],
) -> Result<bool> {
    let was_frozen = is_token_account_frozen(account)?;
    if was_frozen {
        token_2022::thaw_account(
            CpiContext::new_with_signer(
                token_program.to_account_info(),
                ThawAccount {
                    account: account.clone(),
                    mint: mint.to_account_info(),
                    authority: authority.clone(),
                },
                signer_seeds,
            ),
        )?;
    }
    Ok(was_frozen)
}

/// Re-freeze a token account only if it was previously frozen.
pub fn refreeze_if_was_frozen<'info>(
    was_frozen: bool,
    account: &AccountInfo<'info>,
    mint: &InterfaceAccount<'info, Mint>,
    authority: &AccountInfo<'info>,
    token_program: &Program<'info, Token2022>,
    signer_seeds: &[&[&[u8]]],
) -> Result<()> {
    if was_frozen {
        token_2022::freeze_account(
            CpiContext::new_with_signer(
                token_program.to_account_info(),
                FreezeAccount {
                    account: account.clone(),
                    mint: mint.to_account_info(),
                    authority: authority.clone(),
                },
                signer_seeds,
            ),
        )?;
    }
    Ok(())
}

