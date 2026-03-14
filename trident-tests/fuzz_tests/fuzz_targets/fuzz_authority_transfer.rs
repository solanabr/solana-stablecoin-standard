//! Two-Step Authority Transfer Fuzz Test
//!
//! Tests for authority transfer vulnerabilities.
//! Ensures two-step transfer cannot be bypassed or exploited.

use trident_client::prelude::*;
use solana_sdk::pubkey::Pubkey;
use arbitrary::Arbitrary;

/// Authority transfer operations
#[derive(Debug, Clone, Arbitrary)]
pub enum AuthorityOperation {
    /// Nominate new authority
    Nominate { caller_index: u8, nominee_index: u8 },
    /// Accept authority (by nominee)
    Accept { caller_index: u8 },
    /// Attempt action as authority
    AttemptAuthorityAction { caller_index: u8 },
    /// Re-nominate (cancel previous)
    ReNominate { caller_index: u8, nominee_index: u8 },
}

/// Authority transfer state
pub struct AuthorityState {
    pub authority: Pubkey,
    pub pending_authority: Option<Pubkey>,
    pub users: Vec<Pubkey>,
    pub violations: Vec<String>,
}

impl AuthorityState {
    pub fn new() -> Self {
        let users: Vec<Pubkey> = (0..5).map(|_| Pubkey::new_unique()).collect();
        let authority = users[0];
        
        Self {
            authority,
            pending_authority: None,
            users,
            violations: Vec::new(),
        }
    }
    
    fn get_user(&self, index: u8) -> Pubkey {
        self.users[(index as usize) % self.users.len()]
    }
    
    fn is_authority(&self, caller: &Pubkey) -> bool {
        *caller == self.authority
    }
    
    fn is_pending_authority(&self, caller: &Pubkey) -> bool {
        self.pending_authority == Some(*caller)
    }
    
    /// Nominate new authority (step 1)
    pub fn nominate(&mut self, caller: &Pubkey, nominee: &Pubkey) -> Result<(), &'static str> {
        // Only current authority can nominate
        if !self.is_authority(caller) {
            return Err("not_authority");
        }
        
        // Cannot nominate self (pointless)
        if caller == nominee {
            return Err("cannot_nominate_self");
        }
        
        // Set pending
        self.pending_authority = Some(*nominee);
        Ok(())
    }
    
    /// Accept authority (step 2)
    pub fn accept(&mut self, caller: &Pubkey) -> Result<(), &'static str> {
        // Only pending authority can accept
        if !self.is_pending_authority(caller) {
            return Err("not_pending_authority");
        }
        
        // Transfer authority
        self.authority = *caller;
        self.pending_authority = None;
        Ok(())
    }
    
    /// Attempt an authority-only action
    pub fn attempt_authority_action(&self, caller: &Pubkey) -> Result<(), &'static str> {
        if !self.is_authority(caller) {
            return Err("not_authority");
        }
        Ok(())
    }
}

/// Property: Authority transfer must be two-step
pub fn prop_two_step_transfer(operations: Vec<AuthorityOperation>) {
    let mut state = AuthorityState::new();
    let original_authority = state.authority;
    
    for op in operations {
        match op {
            AuthorityOperation::Nominate { caller_index, nominee_index } => {
                let caller = state.get_user(caller_index);
                let nominee = state.get_user(nominee_index);
                let _ = state.nominate(&caller, &nominee);
            }
            
            AuthorityOperation::Accept { caller_index } => {
                let caller = state.get_user(caller_index);
                let was_pending = state.is_pending_authority(&caller);
                let result = state.accept(&caller);
                
                // Only pending authority should be able to accept
                if result.is_ok() && !was_pending {
                    state.violations.push(format!(
                        "Non-pending {} became authority!",
                        caller
                    ));
                }
            }
            
            AuthorityOperation::AttemptAuthorityAction { caller_index } => {
                let caller = state.get_user(caller_index);
                let is_auth = state.is_authority(&caller);
                let result = state.attempt_authority_action(&caller);
                
                // Only actual authority should succeed
                if result.is_ok() && !is_auth {
                    state.violations.push(format!(
                        "Non-authority {} performed authority action!",
                        caller
                    ));
                }
            }
            
            AuthorityOperation::ReNominate { caller_index, nominee_index } => {
                let caller = state.get_user(caller_index);
                let nominee = state.get_user(nominee_index);
                
                // Re-nomination should cancel previous pending
                let prev_pending = state.pending_authority;
                let result = state.nominate(&caller, &nominee);
                
                if result.is_ok() {
                    // Previous pending should no longer work
                    if let Some(prev) = prev_pending {
                        if prev != nominee {
                            // Try to accept as previous pending (should fail)
                            let accept_result = state.accept(&prev);
                            if accept_result.is_ok() {
                                state.violations.push(
                                    "Previous pending accepted after re-nomination!".to_string()
                                );
                            }
                        }
                    }
                }
            }
        }
    }
    
    if !state.violations.is_empty() {
        panic!("AUTHORITY BYPASS:\n{}", state.violations.join("\n"));
    }
    
    // Verify: If authority changed, it was via proper two-step
    if state.authority != original_authority {
        // This is OK as long as no violations were detected
        println!("Authority transferred from {:?} to {:?}", original_authority, state.authority);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_basic_two_step() {
        let mut state = AuthorityState::new();
        let authority = state.authority;
        let nominee = state.users[1];
        
        // Step 1: Authority nominates
        state.nominate(&authority, &nominee).unwrap();
        assert_eq!(state.pending_authority, Some(nominee));
        
        // Authority unchanged
        assert_eq!(state.authority, authority);
        
        // Step 2: Nominee accepts
        state.accept(&nominee).unwrap();
        assert_eq!(state.authority, nominee);
        assert_eq!(state.pending_authority, None);
    }
    
    #[test]
    fn test_non_authority_cannot_nominate() {
        let mut state = AuthorityState::new();
        let non_authority = state.users[1];
        let nominee = state.users[2];
        
        let result = state.nominate(&non_authority, &nominee);
        assert_eq!(result, Err("not_authority"));
    }
    
    #[test]
    fn test_non_pending_cannot_accept() {
        let mut state = AuthorityState::new();
        let authority = state.authority;
        let nominee = state.users[1];
        let other = state.users[2];
        
        // Nominate one person
        state.nominate(&authority, &nominee).unwrap();
        
        // Someone else tries to accept
        let result = state.accept(&other);
        assert_eq!(result, Err("not_pending_authority"));
        
        // Authority unchanged
        assert_eq!(state.authority, authority);
    }
    
    #[test]
    fn test_cannot_skip_nomination() {
        let mut state = AuthorityState::new();
        let random_user = state.users[2];
        
        // Try to accept without nomination
        let result = state.accept(&random_user);
        assert_eq!(result, Err("not_pending_authority"));
    }
    
    #[test]
    fn test_renomination_cancels_previous() {
        let mut state = AuthorityState::new();
        let authority = state.authority;
        let first_nominee = state.users[1];
        let second_nominee = state.users[2];
        
        // First nomination
        state.nominate(&authority, &first_nominee).unwrap();
        assert_eq!(state.pending_authority, Some(first_nominee));
        
        // Re-nominate someone else
        state.nominate(&authority, &second_nominee).unwrap();
        assert_eq!(state.pending_authority, Some(second_nominee));
        
        // First nominee can no longer accept
        let result = state.accept(&first_nominee);
        assert_eq!(result, Err("not_pending_authority"));
        
        // Second nominee can accept
        state.accept(&second_nominee).unwrap();
        assert_eq!(state.authority, second_nominee);
    }
    
    #[test]
    fn test_old_authority_loses_power() {
        let mut state = AuthorityState::new();
        let old_authority = state.authority;
        let new_authority = state.users[1];
        
        // Transfer authority
        state.nominate(&old_authority, &new_authority).unwrap();
        state.accept(&new_authority).unwrap();
        
        // Old authority can no longer act
        let result = state.attempt_authority_action(&old_authority);
        assert_eq!(result, Err("not_authority"));
        
        // New authority can act
        let result = state.attempt_authority_action(&new_authority);
        assert!(result.is_ok());
    }
    
    #[test]
    fn test_cannot_nominate_self() {
        let mut state = AuthorityState::new();
        let authority = state.authority;
        
        let result = state.nominate(&authority, &authority);
        assert_eq!(result, Err("cannot_nominate_self"));
    }
    
    #[test]
    fn test_pending_has_no_authority_until_accept() {
        let mut state = AuthorityState::new();
        let authority = state.authority;
        let nominee = state.users[1];
        
        // Nominate
        state.nominate(&authority, &nominee).unwrap();
        
        // Nominee cannot yet act as authority
        let result = state.attempt_authority_action(&nominee);
        assert_eq!(result, Err("not_authority"));
        
        // Original authority still has power
        let result = state.attempt_authority_action(&authority);
        assert!(result.is_ok());
    }
    
    #[test]
    fn test_fuzz_sequence() {
        let ops = vec![
            // Try to accept without nomination
            AuthorityOperation::Accept { caller_index: 2 },
            // Authority nominates
            AuthorityOperation::Nominate { caller_index: 0, nominee_index: 1 },
            // Wrong person tries to accept
            AuthorityOperation::Accept { caller_index: 2 },
            // Correct nominee accepts
            AuthorityOperation::Accept { caller_index: 1 },
            // New authority works
            AuthorityOperation::AttemptAuthorityAction { caller_index: 1 },
            // Old authority fails
            AuthorityOperation::AttemptAuthorityAction { caller_index: 0 },
        ];
        
        prop_two_step_transfer(ops);
    }
}

fn main() {
    println!("Two-Step Authority Transfer Fuzz Test");
    println!("Testing authority transfer cannot be bypassed");
    
    let ops = vec![
        AuthorityOperation::Nominate { caller_index: 0, nominee_index: 1 },
        AuthorityOperation::Accept { caller_index: 2 }, // Wrong person
        AuthorityOperation::Accept { caller_index: 1 }, // Right person
    ];
    
    prop_two_step_transfer(ops);
    println!("Basic authority transfer tests passed!");
}
