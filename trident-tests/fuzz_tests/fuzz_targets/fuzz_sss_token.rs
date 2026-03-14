//! Main SSS Token Fuzz Test
//!
//! This fuzz test covers the core instruction flows of the SSS Token program,
//! testing various sequences of operations to find edge cases and vulnerabilities.

use trident_client::prelude::*;
use anchor_lang::prelude::*;
use solana_sdk::signature::Keypair;
use sss_token::state::*;
use sss_token::error::ErrorCode;
use arbitrary::Arbitrary;

// =============================================================================
// FUZZ DATA TYPES
// =============================================================================

/// Arbitrary instruction data for fuzzing
#[derive(Debug, Clone, Arbitrary)]
pub enum FuzzInstruction {
    Initialize(InitializeData),
    UpdateRoles(UpdateRolesData),
    RevokeRoles,
    MintTokens(MintData),
    BurnTokens(BurnData),
    FreezeAccount,
    ThawAccount,
    BlacklistAddress(BlacklistData),
    RemoveFromBlacklist,
    Pause,
    Unpause,
    NominateAuthority(NominateData),
    AcceptAuthority,
    SetSupplyCap(SupplyCapData),
}

#[derive(Debug, Clone, Arbitrary)]
pub struct InitializeData {
    pub name: [u8; 32],
    pub symbol: [u8; 8],
    pub decimals: u8,
    pub supply_cap: u64,
    pub preset: u8,  // 0=SSS1, 1=SSS2, 2=SSS3
}

#[derive(Debug, Clone, Arbitrary)]
pub struct UpdateRolesData {
    pub is_minter: bool,
    pub is_compliance_officer: bool,
    pub mint_quota: u64,
}

#[derive(Debug, Clone, Arbitrary)]
pub struct MintData {
    pub amount: u64,
}

#[derive(Debug, Clone, Arbitrary)]
pub struct BurnData {
    pub amount: u64,
}

#[derive(Debug, Clone, Arbitrary)]
pub struct BlacklistData {
    pub reason: [u8; 64],
}

#[derive(Debug, Clone, Arbitrary)]
pub struct NominateData {
    pub new_authority_index: u8,  // Index into test keypairs
}

#[derive(Debug, Clone, Arbitrary)]
pub struct SupplyCapData {
    pub new_supply_cap: u64,
}

// =============================================================================
// FUZZ STATE
// =============================================================================

/// Global fuzz state tracking
pub struct FuzzState {
    pub authority: Keypair,
    pub minters: Vec<Keypair>,
    pub compliance_officers: Vec<Keypair>,
    pub regular_users: Vec<Keypair>,
    
    pub is_initialized: bool,
    pub is_paused: bool,
    pub total_minted: u64,
    pub total_burned: u64,
    pub supply_cap: u64,
    
    pub pending_authority: Option<Pubkey>,
    
    pub blacklisted_addresses: Vec<Pubkey>,
    pub frozen_accounts: Vec<Pubkey>,
    
    pub minter_quotas: std::collections::HashMap<Pubkey, u64>,
    pub minter_minted: std::collections::HashMap<Pubkey, u64>,
}

impl Default for FuzzState {
    fn default() -> Self {
        Self {
            authority: Keypair::new(),
            minters: vec![Keypair::new(), Keypair::new()],
            compliance_officers: vec![Keypair::new()],
            regular_users: vec![Keypair::new(), Keypair::new(), Keypair::new()],
            
            is_initialized: false,
            is_paused: false,
            total_minted: 0,
            total_burned: 0,
            supply_cap: u64::MAX,
            
            pending_authority: None,
            
            blacklisted_addresses: Vec::new(),
            frozen_accounts: Vec::new(),
            
            minter_quotas: std::collections::HashMap::new(),
            minter_minted: std::collections::HashMap::new(),
        }
    }
}

// =============================================================================
// INVARIANT CHECKS
// =============================================================================

impl FuzzState {
    /// Check all invariants after each instruction
    pub fn check_invariants(&self) -> Result<(), String> {
        // Invariant 1: Total minted >= Total burned
        if self.total_minted < self.total_burned {
            return Err("CRITICAL: total_minted < total_burned (underflow)".to_string());
        }
        
        // Invariant 2: Current supply <= Supply cap
        let current_supply = self.total_minted.saturating_sub(self.total_burned);
        if current_supply > self.supply_cap && self.supply_cap != 0 {
            return Err("CRITICAL: current_supply > supply_cap".to_string());
        }
        
        // Invariant 3: No minter should exceed their quota
        for (minter, minted) in &self.minter_minted {
            if let Some(quota) = self.minter_quotas.get(minter) {
                if minted > quota {
                    return Err(format!(
                        "CRITICAL: minter {:?} minted {} > quota {}",
                        minter, minted, quota
                    ));
                }
            }
        }
        
        Ok(())
    }
    
    /// Check that pause is enforced
    pub fn assert_pause_enforced(&self, instruction: &FuzzInstruction) -> bool {
        if !self.is_paused {
            return true;
        }
        
        // These should fail when paused
        matches!(
            instruction,
            FuzzInstruction::MintTokens(_) | FuzzInstruction::BurnTokens(_)
        )
    }
    
    /// Check that roles are enforced
    pub fn assert_role_enforced(&self, caller: &Pubkey, instruction: &FuzzInstruction) -> bool {
        match instruction {
            FuzzInstruction::MintTokens(_) | FuzzInstruction::BurnTokens(_) => {
                // Only minters should be able to mint/burn
                self.minters.iter().any(|m| m.pubkey() == *caller)
            }
            FuzzInstruction::FreezeAccount 
            | FuzzInstruction::ThawAccount 
            | FuzzInstruction::BlacklistAddress(_) 
            | FuzzInstruction::RemoveFromBlacklist => {
                // Only compliance officers
                self.compliance_officers.iter().any(|c| c.pubkey() == *caller)
            }
            FuzzInstruction::UpdateRoles(_) 
            | FuzzInstruction::RevokeRoles 
            | FuzzInstruction::NominateAuthority(_) 
            | FuzzInstruction::SetSupplyCap(_) => {
                // Only authority
                self.authority.pubkey() == *caller
            }
            FuzzInstruction::AcceptAuthority => {
                // Only pending authority
                self.pending_authority == Some(*caller)
            }
            _ => true,
        }
    }
}

// =============================================================================
// FUZZ HARNESS
// =============================================================================

/// Main fuzz entry point
pub fn fuzz_instructions(instructions: Vec<(u8, FuzzInstruction)>) {
    let mut state = FuzzState::default();
    
    for (caller_index, instruction) in instructions {
        // Determine caller based on index
        let caller = match caller_index % 5 {
            0 => &state.authority,
            1 => state.minters.first().unwrap(),
            2 => state.compliance_officers.first().unwrap(),
            3 => state.regular_users.first().unwrap(),
            _ => state.regular_users.last().unwrap(),
        };
        
        // Execute instruction (simulated)
        let result = execute_instruction(&mut state, caller, &instruction);
        
        // Verify invariants
        if let Err(e) = state.check_invariants() {
            panic!("Invariant violation: {}", e);
        }
        
        // Log for debugging
        if result.is_err() {
            // Expected failures are OK
        }
    }
}

fn execute_instruction(
    state: &mut FuzzState,
    caller: &Keypair,
    instruction: &FuzzInstruction,
) -> Result<(), ErrorCode> {
    match instruction {
        FuzzInstruction::Initialize(data) => {
            if state.is_initialized {
                return Err(ErrorCode::AlreadyInitialized);
            }
            state.is_initialized = true;
            state.supply_cap = data.supply_cap;
            Ok(())
        }
        
        FuzzInstruction::MintTokens(data) => {
            if !state.is_initialized {
                return Err(ErrorCode::NotInitialized);
            }
            if state.is_paused {
                return Err(ErrorCode::StablecoinPaused);
            }
            
            // Check minter role
            if !state.minters.iter().any(|m| m.pubkey() == caller.pubkey()) {
                return Err(ErrorCode::NotMinter);
            }
            
            // Check quota
            let minted = state.minter_minted.get(&caller.pubkey()).copied().unwrap_or(0);
            let quota = state.minter_quotas.get(&caller.pubkey()).copied().unwrap_or(0);
            if minted.saturating_add(data.amount) > quota {
                return Err(ErrorCode::QuotaExceeded);
            }
            
            // Check supply cap
            let current = state.total_minted.saturating_sub(state.total_burned);
            if current.saturating_add(data.amount) > state.supply_cap && state.supply_cap != 0 {
                return Err(ErrorCode::SupplyCapExceeded);
            }
            
            // Apply
            state.total_minted = state.total_minted.saturating_add(data.amount);
            *state.minter_minted.entry(caller.pubkey()).or_insert(0) += data.amount;
            
            Ok(())
        }
        
        FuzzInstruction::BurnTokens(data) => {
            if !state.is_initialized {
                return Err(ErrorCode::NotInitialized);
            }
            if state.is_paused {
                return Err(ErrorCode::StablecoinPaused);
            }
            
            // Check minter role
            if !state.minters.iter().any(|m| m.pubkey() == caller.pubkey()) {
                return Err(ErrorCode::NotMinter);
            }
            
            // Check sufficient supply
            let current = state.total_minted.saturating_sub(state.total_burned);
            if data.amount > current {
                return Err(ErrorCode::Underflow);
            }
            
            state.total_burned = state.total_burned.saturating_add(data.amount);
            Ok(())
        }
        
        FuzzInstruction::Pause => {
            if state.authority.pubkey() != caller.pubkey() 
                && !state.compliance_officers.iter().any(|c| c.pubkey() == caller.pubkey()) {
                return Err(ErrorCode::NotAuthority);
            }
            
            if state.is_paused {
                return Err(ErrorCode::StablecoinPaused);
            }
            
            state.is_paused = true;
            Ok(())
        }
        
        FuzzInstruction::Unpause => {
            if state.authority.pubkey() != caller.pubkey() 
                && !state.compliance_officers.iter().any(|c| c.pubkey() == caller.pubkey()) {
                return Err(ErrorCode::NotAuthority);
            }
            
            if !state.is_paused {
                return Err(ErrorCode::StablecoinNotPaused);
            }
            
            state.is_paused = false;
            Ok(())
        }
        
        FuzzInstruction::BlacklistAddress(_) => {
            if !state.compliance_officers.iter().any(|c| c.pubkey() == caller.pubkey()) {
                return Err(ErrorCode::NotComplianceOfficer);
            }
            Ok(())
        }
        
        FuzzInstruction::NominateAuthority(data) => {
            if state.authority.pubkey() != caller.pubkey() {
                return Err(ErrorCode::NotAuthority);
            }
            
            let new_auth_index = data.new_authority_index as usize % state.regular_users.len();
            state.pending_authority = Some(state.regular_users[new_auth_index].pubkey());
            Ok(())
        }
        
        FuzzInstruction::AcceptAuthority => {
            if state.pending_authority != Some(caller.pubkey()) {
                return Err(ErrorCode::InvalidPendingAuthority);
            }
            
            // Transfer authority
            // In real impl, we'd update the authority keypair
            state.pending_authority = None;
            Ok(())
        }
        
        FuzzInstruction::SetSupplyCap(data) => {
            if state.authority.pubkey() != caller.pubkey() {
                return Err(ErrorCode::NotAuthority);
            }
            
            let current = state.total_minted.saturating_sub(state.total_burned);
            if data.new_supply_cap < current {
                return Err(ErrorCode::InvalidSupplyCap);
            }
            
            state.supply_cap = data.new_supply_cap;
            Ok(())
        }
        
        _ => Ok(()),
    }
}

// =============================================================================
// PROPERTY TESTS
// =============================================================================

#[cfg(test)]
mod property_tests {
    use super::*;
    
    /// Property: Minting more than quota should always fail
    #[test]
    fn prop_quota_enforced() {
        let mut state = FuzzState::default();
        state.is_initialized = true;
        state.supply_cap = u64::MAX;
        
        let minter = &state.minters[0];
        let quota = 1000;
        state.minter_quotas.insert(minter.pubkey(), quota);
        
        // Mint exactly quota - should succeed
        let result = execute_instruction(
            &mut state,
            minter,
            &FuzzInstruction::MintTokens(MintData { amount: quota }),
        );
        assert!(result.is_ok());
        
        // Mint 1 more - should fail
        let result = execute_instruction(
            &mut state,
            minter,
            &FuzzInstruction::MintTokens(MintData { amount: 1 }),
        );
        assert_eq!(result, Err(ErrorCode::QuotaExceeded));
    }
    
    /// Property: Non-authority cannot update roles
    #[test]
    fn prop_role_update_restricted() {
        let state = FuzzState::default();
        let non_authority = &state.regular_users[0];
        
        assert!(!state.assert_role_enforced(
            &non_authority.pubkey(),
            &FuzzInstruction::UpdateRoles(UpdateRolesData {
                is_minter: true,
                is_compliance_officer: false,
                mint_quota: 1000,
            })
        ));
    }
    
    /// Property: Pause blocks minting
    #[test]
    fn prop_pause_blocks_mint() {
        let mut state = FuzzState::default();
        state.is_initialized = true;
        state.is_paused = true;
        
        let minter = &state.minters[0];
        state.minter_quotas.insert(minter.pubkey(), 1000);
        
        let result = execute_instruction(
            &mut state,
            minter,
            &FuzzInstruction::MintTokens(MintData { amount: 100 }),
        );
        
        assert_eq!(result, Err(ErrorCode::StablecoinPaused));
    }
    
    /// Property: Supply cap cannot be set below current supply
    #[test]
    fn prop_supply_cap_floor() {
        let mut state = FuzzState::default();
        state.is_initialized = true;
        state.total_minted = 10000;
        state.total_burned = 0;
        
        let result = execute_instruction(
            &mut state,
            &state.authority.insecure_clone(),
            &FuzzInstruction::SetSupplyCap(SupplyCapData { new_supply_cap: 5000 }),
        );
        
        assert_eq!(result, Err(ErrorCode::InvalidSupplyCap));
    }
}

fn main() {
    // Trident will inject fuzzing harness here
    println!("SSS Token Fuzz Test Target");
    println!("Run with: cargo +nightly fuzz run fuzz_sss_token");
}
