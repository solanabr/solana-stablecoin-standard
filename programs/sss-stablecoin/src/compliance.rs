//! Compliance validation helpers for SSS-2

use crate::{constants::COMPLIANCE_RECORD_SEED, error::StablecoinError, state::ComplianceRecord};
use anchor_lang::prelude::*;
use solana_program::hash;

/// Validate that a wallet is NOT blacklisted
pub fn validate_not_blacklisted(
    record: &UncheckedAccount,
    wallet: &Pubkey,
    mint: &Pubkey,
) -> Result<()> {
    let (expected, _) = Pubkey::find_program_address(
        &[COMPLIANCE_RECORD_SEED, mint.as_ref(), wallet.as_ref()],
        &crate::ID,
    );
    require_keys_eq!(
        expected,
        record.key(),
        StablecoinError::InvalidComplianceRecord
    );

    if record.owner != &crate::ID {
        return Ok(());
    }

    let parsed = parse_compliance_record(record)?;
    require_keys_eq!(
        parsed.wallet,
        *wallet,
        StablecoinError::InvalidComplianceRecord
    );
    require_keys_eq!(parsed.mint, *mint, StablecoinError::InvalidComplianceRecord);
    require!(!parsed.blacklisted, StablecoinError::WalletBlacklisted);

    Ok(())
}

/// Validate that a wallet IS blacklisted
pub fn validate_blacklisted(
    record: &UncheckedAccount,
    wallet: &Pubkey,
    mint: &Pubkey,
) -> Result<()> {
    let (expected, _) = Pubkey::find_program_address(
        &[COMPLIANCE_RECORD_SEED, mint.as_ref(), wallet.as_ref()],
        &crate::ID,
    );
    require_keys_eq!(
        expected,
        record.key(),
        StablecoinError::InvalidComplianceRecord
    );
    require_keys_eq!(
        *record.owner,
        crate::ID,
        StablecoinError::InvalidComplianceRecord
    );

    let parsed = parse_compliance_record(record)?;
    require_keys_eq!(
        parsed.wallet,
        *wallet,
        StablecoinError::InvalidComplianceRecord
    );
    require_keys_eq!(parsed.mint, *mint, StablecoinError::InvalidComplianceRecord);
    require!(parsed.blacklisted, StablecoinError::WalletNotBlacklisted);

    Ok(())
}

/// Hash a reason string for storage
pub fn hash_reason(reason: &str) -> [u8; 32] {
    hash::hash(reason.as_bytes()).to_bytes()
}

fn parse_compliance_record(record: &UncheckedAccount) -> Result<ComplianceRecord> {
    let data = record.try_borrow_data()?;
    if data.len() < 8 {
        return err!(StablecoinError::InvalidComplianceRecord);
    }

    ComplianceRecord::try_deserialize(&mut &data[..])
        .map_err(|_| error!(StablecoinError::InvalidComplianceRecord))
}
