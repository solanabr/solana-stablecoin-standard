use solana_sdk::pubkey::Pubkey;

pub const SSS_TOKEN_PROGRAM_ID: Pubkey =
    solana_sdk::pubkey!("5ZBiFxX4ggWfNR5VhAQDRZauG6CvG84puS4SQiH8BcL4");

pub const SSS_TRANSFER_HOOK_PROGRAM_ID: Pubkey =
    solana_sdk::pubkey!("FmujD82V5FB6Nus7mbEV2a7cp5HG32gsiHykmtNSRJxy");

pub fn get_config_pda(mint: &Pubkey) -> (Pubkey, u8) {
    Pubkey::find_program_address(&[b"config", mint.as_ref()], &SSS_TOKEN_PROGRAM_ID)
}

pub fn get_role_registry_pda(config: &Pubkey) -> (Pubkey, u8) {
    Pubkey::find_program_address(&[b"roles", config.as_ref()], &SSS_TOKEN_PROGRAM_ID)
}

pub fn get_minter_info_pda(config: &Pubkey, minter: &Pubkey) -> (Pubkey, u8) {
    Pubkey::find_program_address(
        &[b"minter", config.as_ref(), minter.as_ref()],
        &SSS_TOKEN_PROGRAM_ID,
    )
}

pub fn get_blacklist_pda(config: &Pubkey, address: &Pubkey) -> (Pubkey, u8) {
    Pubkey::find_program_address(
        &[b"blacklist", config.as_ref(), address.as_ref()],
        &SSS_TOKEN_PROGRAM_ID,
    )
}

pub fn get_reserve_attestation_pda(config: &Pubkey, index: u64) -> (Pubkey, u8) {
    Pubkey::find_program_address(
        &[b"reserve", config.as_ref(), &index.to_le_bytes()],
        &SSS_TOKEN_PROGRAM_ID,
    )
}

pub fn get_extra_account_meta_list_pda(mint: &Pubkey) -> (Pubkey, u8) {
    Pubkey::find_program_address(
        &[b"extra-account-metas", mint.as_ref()],
        &SSS_TRANSFER_HOOK_PROGRAM_ID,
    )
}
