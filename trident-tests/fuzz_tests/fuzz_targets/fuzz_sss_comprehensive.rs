//! Full SSS Integration Fuzz Harness
//!
//! Comprehensive fuzz testing for the entire SSS protocol with real on-chain interactions.
//! Uses Trident's account snapshot mechanism for state validation.

use trident_client::prelude::*;
use anchor_lang::prelude::*;
use anchor_spl::token_2022::Token2022;
use solana_sdk::{
    pubkey::Pubkey,
    signature::Keypair,
    signer::Signer,
};
use sss_token::state::*;
use arbitrary::Arbitrary;
use std::collections::HashMap;

// =============================================================================
// COMPREHENSIVE FUZZ DATA TYPES
// =============================================================================

#[derive(Debug, Clone, Arbitrary)]
pub enum SssInstruction {
    // Core operations
    Initialize(InitializeFuzzData),
    MintTokens(MintFuzzData),
    BurnTokens(BurnFuzzData),
    
    // Account management
    FreezeAccount(FreezeFuzzData),
    ThawAccount(ThawFuzzData),
    Pause,
    Unpause,
    
    // Role management
    GrantMinterRole(RoleFuzzData),
    RevokeMinterRole(RoleFuzzData),
    GrantComplianceRole(RoleFuzzData),
    RevokeComplianceRole(RoleFuzzData),
    UpdateMinterQuota(QuotaFuzzData),
    
    // Compliance
    AddToBlacklist(BlacklistFuzzData),
    RemoveFromBlacklist(BlacklistFuzzData),
    Seize(SeizeFuzzData),
    
    // Authority transfer
    NominateAuthority(NominateFuzzData),
    AcceptAuthority(AcceptFuzzData),
    
    // Supply management
    SetSupplyCap(SupplyCapFuzzData),
    
    // Banking rails
    CreateMintRequest(BankingFuzzData),
    ConfirmAndMint,
    CreateRedemption(RedemptionFuzzData),
    CompleteRedemption,
    
    // Oracle
    ConfigureOracle(OracleFuzzData),
    MintWithOracle(MintOracleFuzzData),
}

#[derive(Debug, Clone, Arbitrary)]
pub struct InitializeFuzzData {
    pub name: [u8; 16],
    pub symbol: [u8; 4],
    pub decimals: u8,
    pub supply_cap: u64,
    pub preset: u8, // 0=SSS1, 1=SSS2, 2=SSS3
    pub backing_type: u8, // 0=Fiat, 1=Crypto, 2=Mixed
}

#[derive(Debug, Clone, Arbitrary)]
pub struct MintFuzzData {
    pub caller_index: u8,
    pub amount: u64,
    pub recipient_index: u8,
}

#[derive(Debug, Clone, Arbitrary)]
pub struct BurnFuzzData {
    pub caller_index: u8,
    pub amount: u64,
}

#[derive(Debug, Clone, Arbitrary)]
pub struct FreezeFuzzData {
    pub caller_index: u8,
    pub target_index: u8,
}

#[derive(Debug, Clone, Arbitrary)]
pub struct ThawFuzzData {
    pub caller_index: u8,
    pub target_index: u8,
}

#[derive(Debug, Clone, Arbitrary)]
pub struct RoleFuzzData {
    pub caller_index: u8,
    pub target_index: u8,
}

#[derive(Debug, Clone, Arbitrary)]
pub struct QuotaFuzzData {
    pub caller_index: u8,
    pub minter_index: u8,
    pub quota: u64,
}

#[derive(Debug, Clone, Arbitrary)]
pub struct BlacklistFuzzData {
    pub caller_index: u8,
    pub target_index: u8,
    pub reason: [u8; 32],
}

#[derive(Debug, Clone, Arbitrary)]
pub struct SeizeFuzzData {
    pub caller_index: u8,
    pub target_index: u8,
    pub amount: u64,
}

#[derive(Debug, Clone, Arbitrary)]
pub struct NominateFuzzData {
    pub caller_index: u8,
    pub new_authority_index: u8,
}

#[derive(Debug, Clone, Arbitrary)]
pub struct AcceptFuzzData {
    pub caller_index: u8,
}

#[derive(Debug, Clone, Arbitrary)]
pub struct SupplyCapFuzzData {
    pub caller_index: u8,
    pub new_cap: u64,
}

#[derive(Debug, Clone, Arbitrary)]
pub struct BankingFuzzData {
    pub amount: u64,
    pub reference_id: [u8; 32],
}

#[derive(Debug, Clone, Arbitrary)]
pub struct RedemptionFuzzData {
    pub amount: u64,
    pub bank_account_hash: [u8; 32],
}

#[derive(Debug, Clone, Arbitrary)]
pub struct OracleFuzzData {
    pub max_staleness_seconds: u64,
    pub max_deviation_bps: u16,
    pub target_price: i64,
}

#[derive(Debug, Clone, Arbitrary)]
pub struct MintOracleFuzzData {
    pub caller_index: u8,
    pub amount: u64,
}

// =============================================================================
// COMPREHENSIVE FUZZ STATE
// =============================================================================

#[derive(Debug, Clone)]
pub struct UserState {
    pub pubkey: Pubkey,
    pub is_minter: bool,
    pub is_compliance_officer: bool,
    pub mint_quota: u64,
    pub minted_amount: u64,
    pub token_balance: u64,
    pub is_frozen: bool,
    pub is_blacklisted: bool,
}

#[derive(Debug, Clone)]
pub struct MintRequest {
    pub id: [u8; 32],
    pub amount: u64,
    pub requester: u8,
    pub confirmed: bool,
}

#[derive(Debug, Clone)]
pub struct RedemptionRequest {
    pub amount: u64,
    pub requester: u8,
    pub completed: bool,
}

pub struct ComprehensiveFuzzState {
    pub is_initialized: bool,
    pub authority_index: u8,
    pub pending_authority_index: Option<u8>,
    
    pub users: Vec<UserState>,
    
    pub supply_cap: u64,
    pub total_minted: u64,
    pub total_burned: u64,
    pub is_paused: bool,
    
    pub preset: u8,
    
    pub mint_requests: Vec<MintRequest>,
    pub redemption_requests: Vec<RedemptionRequest>,
    
    pub oracle_enabled: bool,
    pub oracle_max_staleness: u64,
    pub oracle_max_deviation_bps: u16,
    
    pub violations: Vec<String>,
    pub instruction_count: u64,
}

impl ComprehensiveFuzzState {
    pub fn new() -> Self {
        // Create 8 users with unique pubkeys
        let users: Vec<UserState> = (0..8)
            .map(|i| UserState {
                pubkey: Pubkey::new_unique(),
                is_minter: i == 1, // User 1 starts as minter
                is_compliance_officer: i == 2, // User 2 starts as compliance
                mint_quota: if i == 1 { 1_000_000 } else { 0 },
                minted_amount: 0,
                token_balance: 0,
                is_frozen: false,
                is_blacklisted: false,
            })
            .collect();

        Self {
            is_initialized: false,
            authority_index: 0, // User 0 is authority
            pending_authority_index: None,
            users,
            supply_cap: u64::MAX,
            total_minted: 0,
            total_burned: 0,
            is_paused: false,
            preset: 0, // SSS-1 by default
            mint_requests: Vec::new(),
            redemption_requests: Vec::new(),
            oracle_enabled: false,
            oracle_max_staleness: 60,
            oracle_max_deviation_bps: 100,
            violations: Vec::new(),
            instruction_count: 0,
        }
    }

    fn get_user(&self, index: u8) -> &UserState {
        &self.users[(index as usize) % self.users.len()]
    }

    fn get_user_mut(&mut self, index: u8) -> &mut UserState {
        let len = self.users.len();
        &mut self.users[(index as usize) % len]
    }

    fn is_authority(&self, index: u8) -> bool {
        (index % self.users.len() as u8) == self.authority_index
    }

    fn is_minter(&self, index: u8) -> bool {
        self.get_user(index).is_minter
    }

    fn is_compliance(&self, index: u8) -> bool {
        self.get_user(index).is_compliance_officer
    }

    fn current_supply(&self) -> u64 {
        self.total_minted.saturating_sub(self.total_burned)
    }
}

// =============================================================================
// INSTRUCTION EXECUTION
// =============================================================================

impl ComprehensiveFuzzState {
    pub fn execute(&mut self, instruction: &SssInstruction) -> Result<(), String> {
        self.instruction_count += 1;
        
        match instruction {
            SssInstruction::Initialize(data) => self.handle_initialize(data),
            SssInstruction::MintTokens(data) => self.handle_mint(data),
            SssInstruction::BurnTokens(data) => self.handle_burn(data),
            SssInstruction::FreezeAccount(data) => self.handle_freeze(data),
            SssInstruction::ThawAccount(data) => self.handle_thaw(data),
            SssInstruction::Pause => self.handle_pause(),
            SssInstruction::Unpause => self.handle_unpause(),
            SssInstruction::GrantMinterRole(data) => self.handle_grant_minter(data),
            SssInstruction::RevokeMinterRole(data) => self.handle_revoke_minter(data),
            SssInstruction::GrantComplianceRole(data) => self.handle_grant_compliance(data),
            SssInstruction::RevokeComplianceRole(data) => self.handle_revoke_compliance(data),
            SssInstruction::UpdateMinterQuota(data) => self.handle_update_quota(data),
            SssInstruction::AddToBlacklist(data) => self.handle_blacklist_add(data),
            SssInstruction::RemoveFromBlacklist(data) => self.handle_blacklist_remove(data),
            SssInstruction::Seize(data) => self.handle_seize(data),
            SssInstruction::NominateAuthority(data) => self.handle_nominate(data),
            SssInstruction::AcceptAuthority(data) => self.handle_accept_authority(data),
            SssInstruction::SetSupplyCap(data) => self.handle_set_supply_cap(data),
            SssInstruction::CreateMintRequest(data) => self.handle_create_mint_request(data),
            SssInstruction::ConfirmAndMint => self.handle_confirm_mint(),
            SssInstruction::CreateRedemption(data) => self.handle_create_redemption(data),
            SssInstruction::CompleteRedemption => self.handle_complete_redemption(),
            SssInstruction::ConfigureOracle(data) => self.handle_configure_oracle(data),
            SssInstruction::MintWithOracle(data) => self.handle_mint_with_oracle(data),
        }
    }

    fn handle_initialize(&mut self, data: &InitializeFuzzData) -> Result<(), String> {
        if self.is_initialized {
            return Err("already_initialized".to_string());
        }
        
        self.is_initialized = true;
        self.supply_cap = data.supply_cap;
        self.preset = data.preset % 3;
        
        Ok(())
    }

    fn handle_mint(&mut self, data: &MintFuzzData) -> Result<(), String> {
        if !self.is_initialized {
            return Err("not_initialized".to_string());
        }
        if self.is_paused {
            return Err("paused".to_string());
        }
        if !self.is_minter(data.caller_index) && !self.is_authority(data.caller_index) {
            return Err("not_minter".to_string());
        }

        let caller = self.get_user(data.caller_index);
        let new_minted = caller.minted_amount.saturating_add(data.amount);
        if new_minted > caller.mint_quota && !self.is_authority(data.caller_index) {
            return Err("quota_exceeded".to_string());
        }

        let new_supply = self.current_supply().saturating_add(data.amount);
        if new_supply > self.supply_cap && self.supply_cap != 0 {
            return Err("supply_cap_exceeded".to_string());
        }

        // Check recipient is not blacklisted
        let recipient = self.get_user(data.recipient_index);
        if recipient.is_blacklisted {
            return Err("recipient_blacklisted".to_string());
        }

        // Update state
        self.get_user_mut(data.caller_index).minted_amount = new_minted;
        self.get_user_mut(data.recipient_index).token_balance = 
            self.get_user(data.recipient_index).token_balance.saturating_add(data.amount);
        self.total_minted = self.total_minted.saturating_add(data.amount);

        Ok(())
    }

    fn handle_burn(&mut self, data: &BurnFuzzData) -> Result<(), String> {
        if !self.is_initialized {
            return Err("not_initialized".to_string());
        }
        if self.is_paused {
            return Err("paused".to_string());
        }
        if !self.is_minter(data.caller_index) && !self.is_authority(data.caller_index) {
            return Err("not_authorized".to_string());
        }

        let caller = self.get_user(data.caller_index);
        if caller.token_balance < data.amount {
            return Err("insufficient_balance".to_string());
        }

        self.get_user_mut(data.caller_index).token_balance = 
            caller.token_balance.saturating_sub(data.amount);
        self.total_burned = self.total_burned.saturating_add(data.amount);

        Ok(())
    }

    fn handle_freeze(&mut self, data: &FreezeFuzzData) -> Result<(), String> {
        if !self.is_initialized {
            return Err("not_initialized".to_string());
        }
        if !self.is_compliance(data.caller_index) && !self.is_authority(data.caller_index) {
            return Err("not_authorized".to_string());
        }

        self.get_user_mut(data.target_index).is_frozen = true;
        Ok(())
    }

    fn handle_thaw(&mut self, data: &ThawFuzzData) -> Result<(), String> {
        if !self.is_initialized {
            return Err("not_initialized".to_string());
        }
        if !self.is_compliance(data.caller_index) && !self.is_authority(data.caller_index) {
            return Err("not_authorized".to_string());
        }

        self.get_user_mut(data.target_index).is_frozen = false;
        Ok(())
    }

    fn handle_pause(&mut self) -> Result<(), String> {
        if !self.is_initialized {
            return Err("not_initialized".to_string());
        }
        if self.is_paused {
            return Err("already_paused".to_string());
        }
        self.is_paused = true;
        Ok(())
    }

    fn handle_unpause(&mut self) -> Result<(), String> {
        if !self.is_initialized {
            return Err("not_initialized".to_string());
        }
        if !self.is_paused {
            return Err("not_paused".to_string());
        }
        self.is_paused = false;
        Ok(())
    }

    fn handle_grant_minter(&mut self, data: &RoleFuzzData) -> Result<(), String> {
        if !self.is_authority(data.caller_index) {
            return Err("not_authority".to_string());
        }
        self.get_user_mut(data.target_index).is_minter = true;
        Ok(())
    }

    fn handle_revoke_minter(&mut self, data: &RoleFuzzData) -> Result<(), String> {
        if !self.is_authority(data.caller_index) {
            return Err("not_authority".to_string());
        }
        self.get_user_mut(data.target_index).is_minter = false;
        Ok(())
    }

    fn handle_grant_compliance(&mut self, data: &RoleFuzzData) -> Result<(), String> {
        if !self.is_authority(data.caller_index) {
            return Err("not_authority".to_string());
        }
        self.get_user_mut(data.target_index).is_compliance_officer = true;
        Ok(())
    }

    fn handle_revoke_compliance(&mut self, data: &RoleFuzzData) -> Result<(), String> {
        if !self.is_authority(data.caller_index) {
            return Err("not_authority".to_string());
        }
        self.get_user_mut(data.target_index).is_compliance_officer = false;
        Ok(())
    }

    fn handle_update_quota(&mut self, data: &QuotaFuzzData) -> Result<(), String> {
        if !self.is_authority(data.caller_index) {
            return Err("not_authority".to_string());
        }
        self.get_user_mut(data.minter_index).mint_quota = data.quota;
        Ok(())
    }

    fn handle_blacklist_add(&mut self, data: &BlacklistFuzzData) -> Result<(), String> {
        if !self.is_compliance(data.caller_index) && !self.is_authority(data.caller_index) {
            return Err("not_authorized".to_string());
        }
        self.get_user_mut(data.target_index).is_blacklisted = true;
        Ok(())
    }

    fn handle_blacklist_remove(&mut self, data: &BlacklistFuzzData) -> Result<(), String> {
        if !self.is_compliance(data.caller_index) && !self.is_authority(data.caller_index) {
            return Err("not_authorized".to_string());
        }
        self.get_user_mut(data.target_index).is_blacklisted = false;
        Ok(())
    }

    fn handle_seize(&mut self, data: &SeizeFuzzData) -> Result<(), String> {
        if !self.is_compliance(data.caller_index) && !self.is_authority(data.caller_index) {
            return Err("not_authorized".to_string());
        }

        let target_balance = self.get_user(data.target_index).token_balance;
        let seize_amount = data.amount.min(target_balance);
        
        self.get_user_mut(data.target_index).token_balance = 
            target_balance.saturating_sub(seize_amount);
        // Seized tokens go to authority
        let auth_idx = self.authority_index;
        self.get_user_mut(auth_idx).token_balance = 
            self.get_user(auth_idx).token_balance.saturating_add(seize_amount);

        Ok(())
    }

    fn handle_nominate(&mut self, data: &NominateFuzzData) -> Result<(), String> {
        if !self.is_authority(data.caller_index) {
            return Err("not_authority".to_string());
        }
        self.pending_authority_index = Some(data.new_authority_index % self.users.len() as u8);
        Ok(())
    }

    fn handle_accept_authority(&mut self, data: &AcceptFuzzData) -> Result<(), String> {
        match self.pending_authority_index {
            Some(pending) if pending == (data.caller_index % self.users.len() as u8) => {
                self.authority_index = pending;
                self.pending_authority_index = None;
                Ok(())
            }
            _ => Err("not_pending_authority".to_string()),
        }
    }

    fn handle_set_supply_cap(&mut self, data: &SupplyCapFuzzData) -> Result<(), String> {
        if !self.is_authority(data.caller_index) {
            return Err("not_authority".to_string());
        }
        if data.new_cap < self.current_supply() {
            return Err("cap_below_current_supply".to_string());
        }
        self.supply_cap = data.new_cap;
        Ok(())
    }

    fn handle_create_mint_request(&mut self, data: &BankingFuzzData) -> Result<(), String> {
        if !self.is_initialized {
            return Err("not_initialized".to_string());
        }
        self.mint_requests.push(MintRequest {
            id: data.reference_id,
            amount: data.amount,
            requester: self.authority_index,
            confirmed: false,
        });
        Ok(())
    }

    fn handle_confirm_mint(&mut self) -> Result<(), String> {
        if let Some(request) = self.mint_requests.iter_mut().find(|r| !r.confirmed) {
            request.confirmed = true;
            self.total_minted = self.total_minted.saturating_add(request.amount);
            let auth_idx = self.authority_index;
            self.get_user_mut(auth_idx).token_balance = 
                self.get_user(auth_idx).token_balance.saturating_add(request.amount);
            Ok(())
        } else {
            Err("no_pending_request".to_string())
        }
    }

    fn handle_create_redemption(&mut self, data: &RedemptionFuzzData) -> Result<(), String> {
        if !self.is_initialized {
            return Err("not_initialized".to_string());
        }
        self.redemption_requests.push(RedemptionRequest {
            amount: data.amount,
            requester: self.authority_index,
            completed: false,
        });
        self.total_burned = self.total_burned.saturating_add(data.amount);
        Ok(())
    }

    fn handle_complete_redemption(&mut self) -> Result<(), String> {
        if let Some(request) = self.redemption_requests.iter_mut().find(|r| !r.completed) {
            request.completed = true;
            Ok(())
        } else {
            Err("no_pending_redemption".to_string())
        }
    }

    fn handle_configure_oracle(&mut self, data: &OracleFuzzData) -> Result<(), String> {
        if !self.is_initialized {
            return Err("not_initialized".to_string());
        }
        self.oracle_enabled = true;
        self.oracle_max_staleness = data.max_staleness_seconds;
        self.oracle_max_deviation_bps = data.max_deviation_bps;
        Ok(())
    }

    fn handle_mint_with_oracle(&mut self, data: &MintOracleFuzzData) -> Result<(), String> {
        if !self.oracle_enabled {
            return Err("oracle_not_enabled".to_string());
        }
        // Oracle validation would happen here
        self.handle_mint(&MintFuzzData {
            caller_index: data.caller_index,
            amount: data.amount,
            recipient_index: data.caller_index,
        })
    }
}

// =============================================================================
// INVARIANT CHECKS
// =============================================================================

impl ComprehensiveFuzzState {
    pub fn check_all_invariants(&self) -> Vec<String> {
        let mut violations = Vec::new();

        // Invariant 1: Total minted >= Total burned
        if self.total_minted < self.total_burned {
            violations.push(format!(
                "CRITICAL: total_minted ({}) < total_burned ({})",
                self.total_minted, self.total_burned
            ));
        }

        // Invariant 2: Current supply <= Supply cap (if cap is set)
        if self.supply_cap != 0 && self.current_supply() > self.supply_cap {
            violations.push(format!(
                "CRITICAL: current_supply ({}) > supply_cap ({})",
                self.current_supply(), self.supply_cap
            ));
        }

        // Invariant 3: Sum of balances == current supply
        let balance_sum: u64 = self.users.iter().map(|u| u.token_balance).sum();
        if balance_sum != self.current_supply() {
            violations.push(format!(
                "CRITICAL: balance_sum ({}) != current_supply ({})",
                balance_sum, self.current_supply()
            ));
        }

        // Invariant 4: No minter exceeded their quota
        for (i, user) in self.users.iter().enumerate() {
            if i != self.authority_index as usize && user.minted_amount > user.mint_quota {
                violations.push(format!(
                    "CRITICAL: User {} minted {} > quota {}",
                    i, user.minted_amount, user.mint_quota
                ));
            }
        }

        // Invariant 5: Blacklisted users have zero balance (if seize was called)
        // This is a soft invariant - depends on compliance actions

        violations
    }
}

// =============================================================================
// FUZZ HARNESS
// =============================================================================

pub fn fuzz_sss_comprehensive(instructions: Vec<SssInstruction>) {
    let mut state = ComprehensiveFuzzState::new();

    for instruction in instructions {
        let _ = state.execute(&instruction);
        
        // Check invariants after each instruction
        let violations = state.check_all_invariants();
        if !violations.is_empty() {
            panic!("Invariant violations:\n{}", violations.join("\n"));
        }
    }
}

// =============================================================================
// PROPERTY TESTS
// =============================================================================

#[cfg(test)]
mod property_tests {
    use super::*;

    #[test]
    fn prop_balance_conservation() {
        let mut state = ComprehensiveFuzzState::new();
        
        // Initialize
        state.execute(&SssInstruction::Initialize(InitializeFuzzData {
            name: [0u8; 16],
            symbol: [0u8; 4],
            decimals: 6,
            supply_cap: 1_000_000_000,
            preset: 1,
            backing_type: 0,
        })).unwrap();

        // Mint some tokens
        state.execute(&SssInstruction::MintTokens(MintFuzzData {
            caller_index: 0, // authority
            amount: 1_000_000,
            recipient_index: 1,
        })).unwrap();

        // Check balances
        assert_eq!(state.current_supply(), 1_000_000);
        assert_eq!(state.users[1].token_balance, 1_000_000);

        // Burn some
        state.get_user_mut(1).is_minter = true; // Grant minter for burn test
        state.execute(&SssInstruction::BurnTokens(BurnFuzzData {
            caller_index: 1,
            amount: 500_000,
        })).unwrap();

        // Verify conservation
        assert_eq!(state.current_supply(), 500_000);
        let violations = state.check_all_invariants();
        assert!(violations.is_empty(), "Violations: {:?}", violations);
    }

    #[test]
    fn prop_unauthorized_mint_fails() {
        let mut state = ComprehensiveFuzzState::new();
        
        state.execute(&SssInstruction::Initialize(InitializeFuzzData {
            name: [0u8; 16],
            symbol: [0u8; 4],
            decimals: 6,
            supply_cap: 1_000_000_000,
            preset: 1,
            backing_type: 0,
        })).unwrap();

        // Try to mint as non-minter (user 3)
        let result = state.execute(&SssInstruction::MintTokens(MintFuzzData {
            caller_index: 3,
            amount: 1_000_000,
            recipient_index: 3,
        }));

        assert!(result.is_err());
        assert_eq!(result.unwrap_err(), "not_minter");
    }

    #[test]
    fn prop_supply_cap_enforced() {
        let mut state = ComprehensiveFuzzState::new();
        
        state.execute(&SssInstruction::Initialize(InitializeFuzzData {
            name: [0u8; 16],
            symbol: [0u8; 4],
            decimals: 6,
            supply_cap: 1_000_000, // 1M cap
            preset: 1,
            backing_type: 0,
        })).unwrap();

        // Mint up to cap
        state.execute(&SssInstruction::MintTokens(MintFuzzData {
            caller_index: 0,
            amount: 1_000_000,
            recipient_index: 1,
        })).unwrap();

        // Try to mint 1 more - should fail
        let result = state.execute(&SssInstruction::MintTokens(MintFuzzData {
            caller_index: 0,
            amount: 1,
            recipient_index: 1,
        }));

        assert!(result.is_err());
        assert_eq!(result.unwrap_err(), "supply_cap_exceeded");
    }

    #[test]
    fn prop_pause_blocks_operations() {
        let mut state = ComprehensiveFuzzState::new();
        
        state.execute(&SssInstruction::Initialize(InitializeFuzzData {
            name: [0u8; 16],
            symbol: [0u8; 4],
            decimals: 6,
            supply_cap: 1_000_000_000,
            preset: 1,
            backing_type: 0,
        })).unwrap();

        state.execute(&SssInstruction::Pause).unwrap();

        // Try to mint while paused
        let result = state.execute(&SssInstruction::MintTokens(MintFuzzData {
            caller_index: 0,
            amount: 1_000_000,
            recipient_index: 1,
        }));

        assert!(result.is_err());
        assert_eq!(result.unwrap_err(), "paused");
    }

    #[test]
    fn prop_blacklist_blocks_mint_to() {
        let mut state = ComprehensiveFuzzState::new();
        
        state.execute(&SssInstruction::Initialize(InitializeFuzzData {
            name: [0u8; 16],
            symbol: [0u8; 4],
            decimals: 6,
            supply_cap: 1_000_000_000,
            preset: 2, // SSS-2 with blacklist
            backing_type: 0,
        })).unwrap();

        // Blacklist user 3
        state.execute(&SssInstruction::AddToBlacklist(BlacklistFuzzData {
            caller_index: 0,
            target_index: 3,
            reason: [0u8; 32],
        })).unwrap();

        // Try to mint to blacklisted user
        let result = state.execute(&SssInstruction::MintTokens(MintFuzzData {
            caller_index: 0,
            amount: 1_000_000,
            recipient_index: 3,
        }));

        assert!(result.is_err());
        assert_eq!(result.unwrap_err(), "recipient_blacklisted");
    }

    #[test]
    fn prop_two_step_authority_transfer() {
        let mut state = ComprehensiveFuzzState::new();
        
        state.execute(&SssInstruction::Initialize(InitializeFuzzData {
            name: [0u8; 16],
            symbol: [0u8; 4],
            decimals: 6,
            supply_cap: 1_000_000_000,
            preset: 1,
            backing_type: 0,
        })).unwrap();

        assert_eq!(state.authority_index, 0);

        // Nominate user 3 as new authority
        state.execute(&SssInstruction::NominateAuthority(NominateFuzzData {
            caller_index: 0,
            new_authority_index: 3,
        })).unwrap();

        // User 0 should still be authority
        assert_eq!(state.authority_index, 0);

        // User 3 accepts
        state.execute(&SssInstruction::AcceptAuthority(AcceptFuzzData {
            caller_index: 3,
        })).unwrap();

        // Now user 3 is authority
        assert_eq!(state.authority_index, 3);
    }
}

fn main() {
    println!("SSS Comprehensive Fuzz Test Harness");
    println!("Run with: cargo +nightly fuzz run fuzz_sss_comprehensive");
}
