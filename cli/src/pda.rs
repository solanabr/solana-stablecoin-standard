use solana_sdk::pubkey::Pubkey;

// Seeds (match programs/sss/src/constants.rs)
const CONFIG_SEED: &[u8] = b"config";
const ROLE_SEED: &[u8] = b"role";
const MINTER_SEED: &[u8] = b"minter";
const SEIZER_SEED: &[u8] = b"seizer";
const FREEZE_SEED: &[u8] = b"freeze";
const PAUSE_SEED: &[u8] = b"pause";
const BLACKLIST_SEED: &[u8] = b"blacklist";

// Role name seeds
pub const MASTER_ROLE: &[u8] = b"master";
pub const MINTER_ROLE: &[u8] = b"minter";
pub const BURNER_ROLE: &[u8] = b"burner";
pub const PAUSER_ROLE: &[u8] = b"pauser";
pub const BLACKLISTER_ROLE: &[u8] = b"blacklister";
pub const SEIZER_ROLE: &[u8] = b"seizer";

pub fn config_pda(program_id: &Pubkey, mint: &Pubkey) -> (Pubkey, u8) {
    Pubkey::find_program_address(&[CONFIG_SEED, mint.as_ref()], program_id)
}

pub fn mint_authority_pda(program_id: &Pubkey, mint: &Pubkey) -> (Pubkey, u8) {
    Pubkey::find_program_address(&[MINTER_SEED, mint.as_ref()], program_id)
}

pub fn freeze_authority_pda(program_id: &Pubkey, mint: &Pubkey) -> (Pubkey, u8) {
    Pubkey::find_program_address(&[FREEZE_SEED, mint.as_ref()], program_id)
}

pub fn pause_authority_pda(program_id: &Pubkey, mint: &Pubkey) -> (Pubkey, u8) {
    Pubkey::find_program_address(&[PAUSE_SEED, mint.as_ref()], program_id)
}

pub fn seizer_authority_pda(program_id: &Pubkey, mint: &Pubkey) -> (Pubkey, u8) {
    Pubkey::find_program_address(&[SEIZER_SEED, mint.as_ref()], program_id)
}

pub fn role_pda(program_id: &Pubkey, mint: &Pubkey, role: &[u8], user: &Pubkey) -> (Pubkey, u8) {
    Pubkey::find_program_address(&[ROLE_SEED, mint.as_ref(), role, user.as_ref()], program_id)
}

pub fn master_role_pda(program_id: &Pubkey, mint: &Pubkey, master: &Pubkey) -> (Pubkey, u8) {
    role_pda(program_id, mint, MASTER_ROLE, master)
}

pub fn minter_account_pda(program_id: &Pubkey, mint: &Pubkey, minter: &Pubkey) -> (Pubkey, u8) {
    role_pda(program_id, mint, MINTER_ROLE, minter)
}

pub fn burner_role_pda(program_id: &Pubkey, mint: &Pubkey, burner: &Pubkey) -> (Pubkey, u8) {
    role_pda(program_id, mint, BURNER_ROLE, burner)
}

pub fn pauser_role_pda(program_id: &Pubkey, mint: &Pubkey, pauser: &Pubkey) -> (Pubkey, u8) {
    role_pda(program_id, mint, PAUSER_ROLE, pauser)
}

pub fn seizer_role_pda(program_id: &Pubkey, mint: &Pubkey, seizer: &Pubkey) -> (Pubkey, u8) {
    role_pda(program_id, mint, SEIZER_ROLE, seizer)
}

pub fn blacklisted_entry_pda(
    program_id: &Pubkey,
    mint: &Pubkey,
    wallet: &Pubkey,
) -> (Pubkey, u8) {
    Pubkey::find_program_address(
        &[BLACKLIST_SEED, mint.as_ref(), wallet.as_ref()],
        program_id,
    )
}
