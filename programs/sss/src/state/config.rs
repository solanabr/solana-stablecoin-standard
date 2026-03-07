use anchor_lang::prelude::*;

use crate::error::StableError;

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq, InitSpace)]
pub enum Standard {
    SSS1,
    SSS2,
}

#[account]
#[derive(InitSpace)]
pub struct StablecoinConfig {
    pub bump: u8,
    pub standard: Standard,
    #[max_len(32)]
    pub name: String,
    #[max_len(32)]
    pub symbol: String,
    #[max_len(200)]
    pub uri: String,
    pub decimals: u8,
    // SSS-2 compliance
    pub enable_permanent_delegate: bool,
    pub enable_transfer_hook: bool,
    pub default_account_frozen: bool,
}

impl StablecoinConfig {
    pub fn assert_sss2(&self) -> Result<()> {
        require!(
            self.standard == Standard::SSS2,
            StableError::ComplianceNotEnabled
        );
        Ok(())
    }

    pub fn assert_transfer_hook_enabled(&self) -> Result<()> {
        require!(
            self.enable_transfer_hook,
            StableError::TransferHookNotEnabled
        );
        Ok(())
    }

    pub fn assert_permanent_delegate_enabled(&self) -> Result<()> {
        require!(
            self.enable_permanent_delegate,
            StableError::PermanentDelegateNotEnabled
        );
        Ok(())
    }
}