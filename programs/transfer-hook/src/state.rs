use anchor_lang::prelude::*;

pub const EXTRA_ACCOUNT_METAS_SEED: &[u8] = b"extra-account-metas";
pub const SSS_BLACKLIST_SEED: &[u8] = b"blacklist";

/// Mirrors the BlacklistEntry from sss-token program for read-only checks.
/// We don't own this account — it's owned by the sss-token program.
/// Must exactly match sss-token/src/state.rs BlacklistEntry layout.
#[account]
pub struct BlacklistEntry {
    pub address: Pubkey,
    pub mint: Pubkey,
    pub reason: String,
    pub blacklisted_at: i64,
    pub blacklisted_by: Pubkey,
    pub active: bool,
    pub bump: u8,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_extra_account_metas_seed() {
        assert_eq!(EXTRA_ACCOUNT_METAS_SEED, b"extra-account-metas");
    }

    #[test]
    fn test_blacklist_seed() {
        assert_eq!(SSS_BLACKLIST_SEED, b"blacklist");
    }
}
