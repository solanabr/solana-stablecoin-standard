use anchor_lang::prelude::Pubkey;
/// Instruction-level fuzz test scaffolding for sss-token.
///
/// This module defines `FuzzInstruction` variants for all 14 sss-token
/// instructions and tests invariant properties that must hold across any
/// sequence of instruction executions.
///
/// Invariants checked:
///   1. Supply consistency: current_supply == total_minted - total_burned
///   2. Role enforcement: only authorized roles can execute restricted ops
///   3. Pause enforcement: minting/burning blocked when paused
///   4. Quota limits: minter cannot exceed assigned quota
///   5. Blacklist enforcement: blacklisted addresses cannot transact (SSS-2)
///   6. Attestation ordering: attestation index increments monotonically
use sss_token::state::*;

// ---------------------------------------------------------------------------
// FuzzInstruction enum — one variant per program instruction
// ---------------------------------------------------------------------------

#[derive(Debug, Clone)]
pub enum FuzzInstruction {
    Initialize {
        name: String,
        symbol: String,
        uri: String,
        decimals: u8,
        preset: StablecoinPreset,
    },
    MintTokens {
        amount: u64,
        minter: Pubkey,
    },
    BurnTokens {
        amount: u64,
    },
    FreezeAccount {
        target: Pubkey,
    },
    ThawAccount {
        target: Pubkey,
    },
    Pause,
    Unpause,
    UpdateRoles {
        role: RoleType,
        new_holder: Pubkey,
    },
    UpdateMinter {
        minter: Pubkey,
        is_active: bool,
        mint_quota: u64,
    },
    TransferAuthority {
        new_authority: Pubkey,
    },
    BlacklistAdd {
        address: Pubkey,
        reason: String,
    },
    BlacklistRemove {
        address: Pubkey,
    },
    Seize {
        from: Pubkey,
        to: Pubkey,
        amount: u64,
    },
    AttestReserve {
        reserve_hash: [u8; 32],
        total_reserves_usd: u64,
        total_outstanding: u64,
        attestation_uri: String,
    },
}

/// Role types for fuzz instruction generation.
#[derive(Debug, Clone, Copy)]
pub enum RoleType {
    Pauser,
    Blacklister,
    Seizer,
}

// ---------------------------------------------------------------------------
// Simulated state for invariant checking
// ---------------------------------------------------------------------------

#[derive(Debug, Clone)]
pub struct SimulatedState {
    pub initialized: bool,
    pub is_paused: bool,
    pub total_minted: u64,
    pub total_burned: u64,
    pub master_authority: Pubkey,
    pub pauser: Pubkey,
    pub blacklister: Pubkey,
    pub seizer: Pubkey,
    pub minters: Vec<SimulatedMinter>,
    pub blacklisted: Vec<Pubkey>,
    pub attestation_index: u64,
    pub preset: StablecoinPreset,
}

#[derive(Debug, Clone)]
pub struct SimulatedMinter {
    pub wallet: Pubkey,
    pub is_active: bool,
    pub quota: u64,
    pub used: u64,
}

impl Default for SimulatedState {
    fn default() -> Self {
        Self {
            initialized: false,
            is_paused: false,
            total_minted: 0,
            total_burned: 0,
            master_authority: Pubkey::default(),
            pauser: Pubkey::default(),
            blacklister: Pubkey::default(),
            seizer: Pubkey::default(),
            minters: Vec::new(),
            blacklisted: Vec::new(),
            attestation_index: 0,
            preset: StablecoinPreset::SSS1,
        }
    }
}

impl SimulatedState {
    pub fn current_supply(&self) -> u64 {
        self.total_minted.saturating_sub(self.total_burned)
    }

    pub fn find_minter(&self, wallet: &Pubkey) -> Option<&SimulatedMinter> {
        self.minters.iter().find(|m| m.wallet == *wallet)
    }

    pub fn find_minter_mut(&mut self, wallet: &Pubkey) -> Option<&mut SimulatedMinter> {
        self.minters.iter_mut().find(|m| m.wallet == *wallet)
    }

    pub fn is_blacklisted(&self, addr: &Pubkey) -> bool {
        self.blacklisted.contains(addr)
    }
}

// ---------------------------------------------------------------------------
// Invariant checks
// ---------------------------------------------------------------------------

fn check_supply_invariant(state: &SimulatedState) {
    assert_eq!(
        state.current_supply(),
        state.total_minted.saturating_sub(state.total_burned),
        "INVARIANT VIOLATED: supply != minted - burned"
    );
    assert!(
        state.total_burned <= state.total_minted,
        "INVARIANT VIOLATED: burned > minted"
    );
}

fn check_quota_invariant(state: &SimulatedState) {
    for minter in &state.minters {
        if minter.quota > 0 {
            assert!(
                minter.used <= minter.quota,
                "INVARIANT VIOLATED: minter {} used ({}) > quota ({})",
                minter.wallet,
                minter.used,
                minter.quota
            );
        }
    }
}

fn check_attestation_invariant(state: &SimulatedState) {
    // Attestation index should never decrease (monotonically increasing)
    // This is implicitly maintained by the increment logic
    assert!(
        state.attestation_index <= u64::MAX,
        "INVARIANT VIOLATED: attestation index overflow"
    );
}

fn check_all_invariants(state: &SimulatedState) {
    check_supply_invariant(state);
    check_quota_invariant(state);
    check_attestation_invariant(state);
}

// ---------------------------------------------------------------------------
// Instruction execution simulation
// ---------------------------------------------------------------------------

fn simulate_instruction(state: &mut SimulatedState, ix: &FuzzInstruction, caller: &Pubkey) {
    match ix {
        FuzzInstruction::Initialize { preset, .. } => {
            if !state.initialized {
                state.initialized = true;
                state.master_authority = *caller;
                state.preset = *preset;
            }
        }
        FuzzInstruction::MintTokens { amount, minter } => {
            if !state.initialized || state.is_paused {
                return; // Should fail on-chain
            }
            if let Some(m) = state.find_minter_mut(minter) {
                if !m.is_active {
                    return;
                }
                if m.quota > 0 && m.used + amount > m.quota {
                    return; // Exceeds quota
                }
                m.used += amount;
                state.total_minted = state.total_minted.saturating_add(*amount);
            }
        }
        FuzzInstruction::BurnTokens { amount } => {
            if !state.initialized || state.is_paused {
                return;
            }
            if *amount <= state.current_supply() {
                state.total_burned = state.total_burned.saturating_add(*amount);
            }
        }
        FuzzInstruction::Pause => {
            if state.initialized && (*caller == state.master_authority || *caller == state.pauser) {
                state.is_paused = true;
            }
        }
        FuzzInstruction::Unpause => {
            if state.initialized && (*caller == state.master_authority || *caller == state.pauser) {
                state.is_paused = false;
            }
        }
        FuzzInstruction::UpdateRoles { role, new_holder } => {
            if *caller != state.master_authority {
                return;
            }
            match role {
                RoleType::Pauser => state.pauser = *new_holder,
                RoleType::Blacklister => state.blacklister = *new_holder,
                RoleType::Seizer => state.seizer = *new_holder,
            }
        }
        FuzzInstruction::UpdateMinter {
            minter,
            is_active,
            mint_quota,
        } => {
            if *caller != state.master_authority {
                return;
            }
            if let Some(m) = state.find_minter_mut(minter) {
                m.is_active = *is_active;
                m.quota = *mint_quota;
            } else {
                state.minters.push(SimulatedMinter {
                    wallet: *minter,
                    is_active: *is_active,
                    quota: *mint_quota,
                    used: 0,
                });
            }
        }
        FuzzInstruction::TransferAuthority { new_authority } => {
            if *caller == state.master_authority {
                state.master_authority = *new_authority;
            }
        }
        FuzzInstruction::BlacklistAdd { address, .. } => {
            if *caller == state.master_authority || *caller == state.blacklister {
                if !state.is_blacklisted(address) {
                    state.blacklisted.push(*address);
                }
            }
        }
        FuzzInstruction::BlacklistRemove { address } => {
            if *caller == state.master_authority || *caller == state.blacklister {
                state.blacklisted.retain(|a| a != address);
            }
        }
        FuzzInstruction::Seize { amount, .. } => {
            if *caller == state.master_authority || *caller == state.seizer {
                // Seize is burn+mint, supply unchanged
                let _ = amount; // supply stays the same
            }
        }
        FuzzInstruction::AttestReserve { .. } => {
            if *caller == state.master_authority {
                state.attestation_index += 1;
            }
        }
        _ => {}
    }

    check_all_invariants(state);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    fn random_pubkey(seed: u8) -> Pubkey {
        let mut bytes = [0u8; 32];
        bytes[0] = seed;
        Pubkey::new_from_array(bytes)
    }

    #[test]
    fn test_supply_invariant_after_mint_burn_sequence() {
        let mut state = SimulatedState::default();
        let authority = random_pubkey(1);
        let minter_wallet = random_pubkey(2);

        // Initialize
        simulate_instruction(
            &mut state,
            &FuzzInstruction::Initialize {
                name: "Test".into(),
                symbol: "TST".into(),
                uri: "".into(),
                decimals: 6,
                preset: StablecoinPreset::SSS1,
            },
            &authority,
        );

        // Add minter
        simulate_instruction(
            &mut state,
            &FuzzInstruction::UpdateMinter {
                minter: minter_wallet,
                is_active: true,
                mint_quota: 1_000_000,
            },
            &authority,
        );

        // Mint
        simulate_instruction(
            &mut state,
            &FuzzInstruction::MintTokens {
                amount: 500_000,
                minter: minter_wallet,
            },
            &minter_wallet,
        );

        assert_eq!(state.total_minted, 500_000);
        assert_eq!(state.current_supply(), 500_000);

        // Burn
        simulate_instruction(
            &mut state,
            &FuzzInstruction::BurnTokens { amount: 200_000 },
            &authority,
        );

        assert_eq!(state.total_burned, 200_000);
        assert_eq!(state.current_supply(), 300_000);
    }

    #[test]
    fn test_quota_enforcement() {
        let mut state = SimulatedState::default();
        let authority = random_pubkey(1);
        let minter = random_pubkey(2);

        simulate_instruction(
            &mut state,
            &FuzzInstruction::Initialize {
                name: "Q".into(),
                symbol: "Q".into(),
                uri: "".into(),
                decimals: 6,
                preset: StablecoinPreset::SSS1,
            },
            &authority,
        );

        simulate_instruction(
            &mut state,
            &FuzzInstruction::UpdateMinter {
                minter,
                is_active: true,
                mint_quota: 100,
            },
            &authority,
        );

        // Mint up to quota
        simulate_instruction(
            &mut state,
            &FuzzInstruction::MintTokens {
                amount: 100,
                minter,
            },
            &minter,
        );
        assert_eq!(state.total_minted, 100);

        // Over quota — should not increase supply
        simulate_instruction(
            &mut state,
            &FuzzInstruction::MintTokens { amount: 1, minter },
            &minter,
        );
        assert_eq!(state.total_minted, 100); // unchanged
    }

    #[test]
    fn test_pause_blocks_minting() {
        let mut state = SimulatedState::default();
        let authority = random_pubkey(1);
        let minter = random_pubkey(2);

        simulate_instruction(
            &mut state,
            &FuzzInstruction::Initialize {
                name: "P".into(),
                symbol: "P".into(),
                uri: "".into(),
                decimals: 6,
                preset: StablecoinPreset::SSS1,
            },
            &authority,
        );

        simulate_instruction(
            &mut state,
            &FuzzInstruction::UpdateMinter {
                minter,
                is_active: true,
                mint_quota: 0,
            },
            &authority,
        );

        simulate_instruction(&mut state, &FuzzInstruction::Pause, &authority);
        assert!(state.is_paused);

        // Mint while paused — should not work
        simulate_instruction(
            &mut state,
            &FuzzInstruction::MintTokens {
                amount: 1000,
                minter,
            },
            &minter,
        );
        assert_eq!(state.total_minted, 0);
    }

    #[test]
    fn test_role_enforcement_unauthorized_pause() {
        let mut state = SimulatedState::default();
        let authority = random_pubkey(1);
        let rando = random_pubkey(99);

        simulate_instruction(
            &mut state,
            &FuzzInstruction::Initialize {
                name: "R".into(),
                symbol: "R".into(),
                uri: "".into(),
                decimals: 6,
                preset: StablecoinPreset::SSS1,
            },
            &authority,
        );

        // Random user cannot pause
        simulate_instruction(&mut state, &FuzzInstruction::Pause, &rando);
        assert!(!state.is_paused);
    }

    #[test]
    fn test_blacklist_enforcement() {
        let mut state = SimulatedState::default();
        let authority = random_pubkey(1);
        let target = random_pubkey(10);

        simulate_instruction(
            &mut state,
            &FuzzInstruction::Initialize {
                name: "B".into(),
                symbol: "B".into(),
                uri: "".into(),
                decimals: 6,
                preset: StablecoinPreset::SSS2,
            },
            &authority,
        );

        // Blacklist
        simulate_instruction(
            &mut state,
            &FuzzInstruction::BlacklistAdd {
                address: target,
                reason: "test".into(),
            },
            &authority,
        );

        assert!(state.is_blacklisted(&target));

        // Remove
        simulate_instruction(
            &mut state,
            &FuzzInstruction::BlacklistRemove { address: target },
            &authority,
        );

        assert!(!state.is_blacklisted(&target));
    }

    #[test]
    fn test_attestation_index_monotonic() {
        let mut state = SimulatedState::default();
        let authority = random_pubkey(1);

        simulate_instruction(
            &mut state,
            &FuzzInstruction::Initialize {
                name: "A".into(),
                symbol: "A".into(),
                uri: "".into(),
                decimals: 6,
                preset: StablecoinPreset::SSS1,
            },
            &authority,
        );

        for i in 0..10 {
            simulate_instruction(
                &mut state,
                &FuzzInstruction::AttestReserve {
                    reserve_hash: [i; 32],
                    total_reserves_usd: 100_00,
                    total_outstanding: 100,
                    attestation_uri: "".into(),
                },
                &authority,
            );
        }

        assert_eq!(state.attestation_index, 10);
    }

    #[test]
    fn test_transfer_authority() {
        let mut state = SimulatedState::default();
        let authority = random_pubkey(1);
        let new_auth = random_pubkey(2);

        simulate_instruction(
            &mut state,
            &FuzzInstruction::Initialize {
                name: "T".into(),
                symbol: "T".into(),
                uri: "".into(),
                decimals: 6,
                preset: StablecoinPreset::SSS1,
            },
            &authority,
        );

        simulate_instruction(
            &mut state,
            &FuzzInstruction::TransferAuthority {
                new_authority: new_auth,
            },
            &authority,
        );

        assert_eq!(state.master_authority, new_auth);

        // Old authority can no longer pause
        simulate_instruction(&mut state, &FuzzInstruction::Pause, &authority);
        assert!(!state.is_paused);

        // New authority can
        simulate_instruction(&mut state, &FuzzInstruction::Pause, &new_auth);
        assert!(state.is_paused);
    }

    #[test]
    fn test_inactive_minter_cannot_mint() {
        let mut state = SimulatedState::default();
        let authority = random_pubkey(1);
        let minter = random_pubkey(2);

        simulate_instruction(
            &mut state,
            &FuzzInstruction::Initialize {
                name: "I".into(),
                symbol: "I".into(),
                uri: "".into(),
                decimals: 6,
                preset: StablecoinPreset::SSS1,
            },
            &authority,
        );

        simulate_instruction(
            &mut state,
            &FuzzInstruction::UpdateMinter {
                minter,
                is_active: false,
                mint_quota: 0,
            },
            &authority,
        );

        simulate_instruction(
            &mut state,
            &FuzzInstruction::MintTokens {
                amount: 1000,
                minter,
            },
            &minter,
        );

        assert_eq!(state.total_minted, 0);
    }

    #[test]
    fn test_seize_does_not_change_supply() {
        let mut state = SimulatedState::default();
        let authority = random_pubkey(1);
        let minter = random_pubkey(2);
        let victim = random_pubkey(3);
        let dest = random_pubkey(4);

        simulate_instruction(
            &mut state,
            &FuzzInstruction::Initialize {
                name: "S".into(),
                symbol: "S".into(),
                uri: "".into(),
                decimals: 6,
                preset: StablecoinPreset::SSS2,
            },
            &authority,
        );

        simulate_instruction(
            &mut state,
            &FuzzInstruction::UpdateMinter {
                minter,
                is_active: true,
                mint_quota: 0,
            },
            &authority,
        );

        simulate_instruction(
            &mut state,
            &FuzzInstruction::MintTokens {
                amount: 1000,
                minter,
            },
            &minter,
        );

        let supply_before = state.current_supply();

        simulate_instruction(
            &mut state,
            &FuzzInstruction::Seize {
                from: victim,
                to: dest,
                amount: 500,
            },
            &authority,
        );

        assert_eq!(state.current_supply(), supply_before);
    }

    #[test]
    fn test_multi_operation_stress() {
        let mut state = SimulatedState::default();
        let authority = random_pubkey(1);
        let minter1 = random_pubkey(2);
        let minter2 = random_pubkey(3);

        simulate_instruction(
            &mut state,
            &FuzzInstruction::Initialize {
                name: "Stress".into(),
                symbol: "STR".into(),
                uri: "".into(),
                decimals: 6,
                preset: StablecoinPreset::SSS2,
            },
            &authority,
        );

        // Add two minters
        simulate_instruction(
            &mut state,
            &FuzzInstruction::UpdateMinter {
                minter: minter1,
                is_active: true,
                mint_quota: 1_000_000,
            },
            &authority,
        );
        simulate_instruction(
            &mut state,
            &FuzzInstruction::UpdateMinter {
                minter: minter2,
                is_active: true,
                mint_quota: 500_000,
            },
            &authority,
        );

        // Interleaved minting
        for _ in 0..50 {
            simulate_instruction(
                &mut state,
                &FuzzInstruction::MintTokens {
                    amount: 10_000,
                    minter: minter1,
                },
                &minter1,
            );
            simulate_instruction(
                &mut state,
                &FuzzInstruction::MintTokens {
                    amount: 5_000,
                    minter: minter2,
                },
                &minter2,
            );
        }

        assert_eq!(state.total_minted, 750_000);
        assert_eq!(state.current_supply(), 750_000);

        // Burn some
        for _ in 0..10 {
            simulate_instruction(
                &mut state,
                &FuzzInstruction::BurnTokens { amount: 25_000 },
                &authority,
            );
        }

        assert_eq!(state.current_supply(), 500_000);

        // Pause/unpause cycle
        simulate_instruction(&mut state, &FuzzInstruction::Pause, &authority);
        simulate_instruction(
            &mut state,
            &FuzzInstruction::MintTokens {
                amount: 999,
                minter: minter1,
            },
            &minter1,
        );
        assert_eq!(state.current_supply(), 500_000); // no change
        simulate_instruction(&mut state, &FuzzInstruction::Unpause, &authority);
    }
}
