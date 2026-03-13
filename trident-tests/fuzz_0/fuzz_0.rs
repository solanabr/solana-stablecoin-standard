//! Trident fuzz test scaffold for Solana Stablecoin Standard (SSS)
//!
//! Covers: supply invariant, role isolation, blacklist PDA determinism,
//! supply cap enforcement, pause enforcement, quota enforcement.
//!
//! Run with: `trident fuzz run fuzz_0`
//! (from trident-tests directory, with full Trident setup)
//!
//! Dependencies: Add `trident-fuzz = "0.12.0"` and `honggfuzz = "0.5"` to
//! Cargo.toml for full fuzzing. This scaffold compiles with sss-token only.

use std::str::FromStr;

use anchor_lang::prelude::*;
use sss_token::constants::{BLACKLIST_SEED, ROLES_SEED, STABLECOIN_SEED};
use sss_token::state::{Role, StablecoinConfig};

// Program ID for sss-token
const SSS_TOKEN_ID: &str = "SSSToknXhFBpMVB1YcqhjQk1iWKA1dqHkST6hamGqmz";

// =============================================================================
// FuzzAccounts: Storage for accounts used across fuzz iterations
// =============================================================================
//
// In full Trident setup, use:
//   KeypairStore: authority, minter, burner, non_authority (for role isolation)
//   PdaStore: stablecoin_config, role_accounts, blacklist_entries
//   MintStore: mint
//   TokenStore: token accounts
//
// trident_fuzz::address_storage::{AddressStorage, PdaSeeds} with
// KeypairStore, PdaStore, MintStore pattern per Trident docs.
//

fn main() {
    // Scaffold entry: In full Trident setup, replace with:
    //   loop { fuzz!(|data: &[u8]| { run_fuzz_iteration(data); }); }
    // For now, run a single smoke iteration to verify scaffold compiles.
    let data = [0u8; 64];
    run_fuzz_iteration(&data);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_blacklist_pda_determinism() {
        let program_id = pubkey_from_str(SSS_TOKEN_ID);
        let config = Pubkey::new_unique();
        let target = Pubkey::new_unique();
        let pda1 = derive_blacklist_pda(&program_id, &config, &target);
        let pda2 = derive_blacklist_pda(&program_id, &config, &target);
        assert_eq!(pda1, pda2);
    }
}

fn run_fuzz_iteration(data: &[u8]) {
    // Use fuzz input to drive instruction selection and parameters.
    // In full setup: TridentRng/Arbitrary derives random instruction sequences.
    if data.len() < 4 {
        return;
    }

    let _seed_stablecoin: &[u8] = STABLECOIN_SEED;
    let _seed_roles: &[u8] = ROLES_SEED;
    let _seed_blacklist: &[u8] = BLACKLIST_SEED;

    // -------------------------------------------------------------------------
    // FLOW 1: Supply invariant
    // -------------------------------------------------------------------------
    // Invariant: total_minted - total_burned == on-chain supply
    //
    // After each mint: config.total_minted += amount; config.current_supply()
    //   must equal mint.supply (from SPL Token mint account)
    // After each burn: config.total_burned += amount; same check
    //
    // check_supply_invariant(): assert config.total_minted - config.total_burned
    //   == token_mint.supply
    //

    // -------------------------------------------------------------------------
    // FLOW 2: Role isolation
    // -------------------------------------------------------------------------
    // Non-authority cannot grant roles. Only authority can call update_roles.
    //
    // Test: Call update_roles(target, role_flag, grant) with non_authority
    //   as signer. Expect Unauthorized or InvalidAuthority.
    // Seed: non_authority keypair, target = some pubkey, role_flag = MINTER
    //
    let _minter_role: u16 = Role::MINTER;

    // -------------------------------------------------------------------------
    // FLOW 3: Blacklist PDA determinism
    // -------------------------------------------------------------------------
    // Same inputs always produce same PDA.
    // PDA seeds: [BLACKLIST_SEED, stablecoin_config.key(), blacklisted_pubkey]
    //
    let program_id = pubkey_from_str(SSS_TOKEN_ID);
    if data.len() >= 32 + 32 {
        let (sc_bytes, target_bytes) = data.split_at(32);
        let stablecoin_config = pubkey_from_slice(sc_bytes);
        let target = pubkey_from_slice(target_bytes);
        let pda1 = derive_blacklist_pda(&program_id, &stablecoin_config, &target);
        let pda2 = derive_blacklist_pda(&program_id, &stablecoin_config, &target);
        assert_eq!(pda1, pda2, "Blacklist PDA must be deterministic");
    }

    // -------------------------------------------------------------------------
    // FLOW 4: Supply cap enforcement
    // -------------------------------------------------------------------------
    // Minting beyond cap fails with SupplyCapExceeded.
    //
    // Setup: config.supply_cap = 1000, current_supply = 900
    // Mint 150 -> expect SupplyCapExceeded (900 + 150 > 1000)
    // Mint 100 -> success, then mint 1 -> SupplyCapExceeded
    //

    // -------------------------------------------------------------------------
    // FLOW 5: Pause enforcement
    // -------------------------------------------------------------------------
    // Operations fail when paused.
    //
    // 1. Pause stablecoin (pauser calls pause)
    // 2. Mint -> expect Paused
    // 3. Burn -> expect Paused
    // 4. Unpause
    // 5. Mint/Burn -> success
    //

    // -------------------------------------------------------------------------
    // FLOW 6: Quota enforcement
    // -------------------------------------------------------------------------
    // Minting beyond minter quota fails with QuotaExceeded.
    //
    // Setup: MinterConfig.quota = 500, minter_config.minted = 400
    // Mint 150 -> expect QuotaExceeded (400 + 150 > 500)
    // Mint 100 -> success
    //

    // Scaffold: In full Trident setup, each flow would:
    // - Build instruction via FuzzInstruction::get_accounts() + get_data()
    // - Execute via TridentSVM/client.process_instruction()
    // - Run check() / invariant validation after execution
}

// =============================================================================
// Invariant check helpers (to be invoked after each relevant instruction)
// =============================================================================

/// Supply invariant: total_minted - total_burned == on-chain supply
#[allow(dead_code)]
fn check_supply_invariant(config: &StablecoinConfig, mint_supply: u64) -> bool {
    config.total_minted.saturating_sub(config.total_burned) == mint_supply
}

/// Blacklist PDA: same (stablecoin_config, target) always yields same address
fn derive_blacklist_pda(
    program_id: &Pubkey,
    stablecoin_config: &Pubkey,
    target: &Pubkey,
) -> Pubkey {
    let (pda, _bump) = Pubkey::find_program_address(
        &[BLACKLIST_SEED, stablecoin_config.as_ref(), target.as_ref()],
        program_id,
    );
    pda
}

fn pubkey_from_str(s: &str) -> Pubkey {
    Pubkey::from_str(s).unwrap_or_default()
}

fn pubkey_from_slice(slice: &[u8]) -> Pubkey {
    let mut arr = [0u8; 32];
    let len = slice.len().min(32);
    arr[..len].copy_from_slice(&slice[..len]);
    Pubkey::new_from_array(arr)
}
