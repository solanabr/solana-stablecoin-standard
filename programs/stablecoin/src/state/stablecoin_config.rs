use anchor_lang::prelude::*;

#[account]
#[derive(Debug)]
pub struct StablecoinConfig {
    pub authority: Pubkey,
    pub pending_authority: Option<Pubkey>,
    pub mint: Pubkey,
    pub name: String,
    pub symbol: String,
    pub uri: String,
    pub decimals: u8,
    pub standard_version: String,
    pub is_paused: bool,
    pub total_minted: u64,
    pub total_burned: u64,
    pub enable_permanent_delegate: bool,
    pub enable_transfer_hook: bool,
    pub default_account_frozen: bool,
    pub enable_confidential_transfers: bool,
    pub enable_zk_compliance_proofs: bool,
    pub enable_compressed_compliance_state: bool,
    pub transfer_hook_program_id: Option<Pubkey>,
    pub proof_verifier_program_id: Option<Pubkey>,
    pub compressed_compliance_root: Option<String>,
    pub compliance_circuit: Option<String>,
    pub bump: u8,
}

impl StablecoinConfig {
    pub const MAX_NAME_LEN: usize = 32;
    pub const MAX_SYMBOL_LEN: usize = 8;
    pub const MAX_URI_LEN: usize = 200;
    pub const MAX_STANDARD_VERSION_LEN: usize = 24;
    pub const MAX_COMPLIANCE_ROOT_LEN: usize = 64;
    pub const MAX_COMPLIANCE_CIRCUIT_LEN: usize = 64;
    const FLAG_FIELD_COUNT: usize = 6;

    pub const LEN: usize = 8
        + 32
        + 33
        + 32
        + (4 + Self::MAX_NAME_LEN)
        + (4 + Self::MAX_SYMBOL_LEN)
        + (4 + Self::MAX_URI_LEN)
        + 1
        + (4 + Self::MAX_STANDARD_VERSION_LEN)
        + 1
        + 8
        + 8
        + Self::FLAG_FIELD_COUNT
        + 33
        + 33
        + (1 + 4 + Self::MAX_COMPLIANCE_ROOT_LEN)
        + (1 + 4 + Self::MAX_COMPLIANCE_CIRCUIT_LEN)
        + 1;

    pub fn preset_level(&self) -> u8 {
        if self.enable_confidential_transfers
            || self.enable_zk_compliance_proofs
            || self.enable_compressed_compliance_state
        {
            return 3;
        }
        if self.enable_permanent_delegate || self.enable_transfer_hook {
            return 2;
        }
        1
    }
}

#[cfg(test)]
mod tests {
    use super::StablecoinConfig;

    #[test]
    fn stablecoin_config_len_accounts_for_all_flag_fields() {
        assert_eq!(StablecoinConfig::FLAG_FIELD_COUNT, 6);
        assert_eq!(StablecoinConfig::LEN, 614);
    }
}
