use anchor_lang::prelude::*;

use crate::errors::SssError;
use crate::state::StablecoinConfig;

pub fn require_blacklist_enabled(config: &StablecoinConfig) -> Result<()> {
    require!(
        config.enable_permanent_delegate && config.enable_transfer_hook,
        SssError::BlacklistNotEnabled
    );
    Ok(())
}

pub fn require_transfer_hook_enabled(config: &StablecoinConfig) -> Result<()> {
    require!(
        config.enable_transfer_hook,
        SssError::TransferHookNotEnabled
    );
    Ok(())
}

pub fn require_confidential_transfers_enabled(config: &StablecoinConfig) -> Result<()> {
    require!(
        config.enable_confidential_transfers,
        SssError::ConfidentialTransfersNotEnabled
    );
    Ok(())
}
