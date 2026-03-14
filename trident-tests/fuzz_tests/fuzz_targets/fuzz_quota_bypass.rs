//! Quota Bypass Fuzz Test
//!
//! Tests for minter quota bypass vulnerabilities.
//! Attempts to find sequences where minters can exceed their allocated quotas.

use trident_client::prelude::*;
use arbitrary::Arbitrary;
use std::collections::HashMap;

/// Fuzz operation for quota testing
#[derive(Debug, Clone, Arbitrary)]
pub enum QuotaOperation {
    /// Set quota for minter
    SetQuota { minter_index: u8, quota: u64 },
    /// Attempt mint
    Mint { minter_index: u8, amount: u64 },
    /// Simulate time passage (epoch reset)
    AdvanceEpoch { hours: u8 },
    /// Multiple small mints
    MultiMint { minter_index: u8, amounts: Vec<u16> },
}

/// Minter state
#[derive(Debug, Clone)]
pub struct MinterState {
    pub quota: u64,
    pub minted_this_epoch: u64,
    pub epoch_start: i64,
}

/// Quota test state
pub struct QuotaState {
    pub minters: Vec<MinterState>,
    pub current_time: i64,
    pub epoch_duration: i64, // 24 hours = 86400 seconds
    
    /// Track quota violations
    pub violations: Vec<String>,
}

impl QuotaState {
    pub fn new() -> Self {
        let minters = (0..3)
            .map(|_| MinterState {
                quota: 1000,  // Default quota
                minted_this_epoch: 0,
                epoch_start: 0,
            })
            .collect();
        
        Self {
            minters,
            current_time: 0,
            epoch_duration: 86400, // 24 hours
            violations: Vec::new(),
        }
    }
    
    /// Set quota for minter
    pub fn set_quota(&mut self, minter_index: usize, quota: u64) {
        if let Some(minter) = self.minters.get_mut(minter_index) {
            minter.quota = quota;
        }
    }
    
    /// Check and reset epoch if needed
    fn check_epoch_reset(&mut self, minter: &mut MinterState) {
        if self.current_time - minter.epoch_start >= self.epoch_duration {
            minter.minted_this_epoch = 0;
            minter.epoch_start = self.current_time;
        }
    }
    
    /// Attempt to mint
    pub fn try_mint(&mut self, minter_index: usize, amount: u64) -> Result<(), &'static str> {
        let minter = self.minters.get_mut(minter_index).ok_or("invalid_minter")?;
        
        // Check epoch reset
        if self.current_time - minter.epoch_start >= self.epoch_duration {
            minter.minted_this_epoch = 0;
            minter.epoch_start = self.current_time;
        }
        
        // Check quota with overflow protection
        let new_minted = minter
            .minted_this_epoch
            .checked_add(amount)
            .ok_or("overflow")?;
        
        if new_minted > minter.quota {
            return Err("quota_exceeded");
        }
        
        minter.minted_this_epoch = new_minted;
        Ok(())
    }
    
    /// Advance time
    pub fn advance_time(&mut self, hours: u64) {
        self.current_time += (hours * 3600) as i64;
    }
    
    /// Verify invariants
    pub fn check_invariants(&self) -> Result<(), String> {
        for (i, minter) in self.minters.iter().enumerate() {
            // Invariant: minted_this_epoch <= quota
            if minter.minted_this_epoch > minter.quota {
                return Err(format!(
                    "Minter {} exceeded quota: {} > {}",
                    i, minter.minted_this_epoch, minter.quota
                ));
            }
        }
        Ok(())
    }
}

/// Property test: Quota cannot be exceeded
pub fn prop_quota_enforced(operations: Vec<QuotaOperation>) {
    let mut state = QuotaState::new();
    
    for op in operations {
        match op {
            QuotaOperation::SetQuota { minter_index, quota } => {
                let idx = (minter_index as usize) % state.minters.len();
                state.set_quota(idx, quota);
            }
            
            QuotaOperation::Mint { minter_index, amount } => {
                let idx = (minter_index as usize) % state.minters.len();
                let _ = state.try_mint(idx, amount);
            }
            
            QuotaOperation::AdvanceEpoch { hours } => {
                state.advance_time(hours as u64);
            }
            
            QuotaOperation::MultiMint { minter_index, amounts } => {
                let idx = (minter_index as usize) % state.minters.len();
                for amount in amounts {
                    let _ = state.try_mint(idx, amount as u64);
                }
            }
        }
        
        // Check invariants after each operation
        if let Err(e) = state.check_invariants() {
            panic!("QUOTA BYPASS DETECTED: {}", e);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_basic_quota() {
        let mut state = QuotaState::new();
        state.set_quota(0, 1000);
        
        // Mint up to quota
        assert!(state.try_mint(0, 500).is_ok());
        assert!(state.try_mint(0, 500).is_ok());
        
        // Exceed quota
        assert_eq!(state.try_mint(0, 1), Err("quota_exceeded"));
    }
    
    #[test]
    fn test_epoch_reset() {
        let mut state = QuotaState::new();
        state.set_quota(0, 1000);
        
        // Use full quota
        state.try_mint(0, 1000).unwrap();
        
        // Can't mint more in same epoch
        assert_eq!(state.try_mint(0, 1), Err("quota_exceeded"));
        
        // Advance 24 hours
        state.advance_time(24);
        
        // Now should be able to mint again
        assert!(state.try_mint(0, 1000).is_ok());
    }
    
    #[test]
    fn test_partial_epoch() {
        let mut state = QuotaState::new();
        state.set_quota(0, 1000);
        
        state.try_mint(0, 500).unwrap();
        
        // Advance 12 hours (not full epoch)
        state.advance_time(12);
        
        // Still in same epoch, should still have 500 remaining
        assert!(state.try_mint(0, 500).is_ok());
        assert_eq!(state.try_mint(0, 1), Err("quota_exceeded"));
    }
    
    #[test]
    fn test_multiple_minters() {
        let mut state = QuotaState::new();
        state.set_quota(0, 1000);
        state.set_quota(1, 2000);
        
        // Minter 0 uses quota
        state.try_mint(0, 1000).unwrap();
        
        // Minter 1 should still have full quota
        assert!(state.try_mint(1, 2000).is_ok());
        
        // Both exhausted
        assert_eq!(state.try_mint(0, 1), Err("quota_exceeded"));
        assert_eq!(state.try_mint(1, 1), Err("quota_exceeded"));
    }
    
    #[test]
    fn test_many_small_mints() {
        let mut state = QuotaState::new();
        state.set_quota(0, 1000);
        
        // 1000 mints of 1
        for i in 0..1000 {
            assert!(state.try_mint(0, 1).is_ok(), "Failed at {}", i);
        }
        
        // 1001st should fail
        assert_eq!(state.try_mint(0, 1), Err("quota_exceeded"));
    }
    
    #[test]
    fn test_overflow_attempt() {
        let mut state = QuotaState::new();
        state.set_quota(0, u64::MAX);
        
        // First large mint
        state.try_mint(0, u64::MAX / 2).unwrap();
        
        // Second large mint would overflow minted_this_epoch
        let result = state.try_mint(0, u64::MAX / 2 + 2);
        assert_eq!(result, Err("overflow"));
    }
    
    #[test]
    fn test_zero_quota() {
        let mut state = QuotaState::new();
        state.set_quota(0, 0);
        
        // Zero quota means no minting allowed
        assert_eq!(state.try_mint(0, 1), Err("quota_exceeded"));
    }
    
    #[test]
    fn test_quota_reduction() {
        let mut state = QuotaState::new();
        state.set_quota(0, 1000);
        
        // Mint 500
        state.try_mint(0, 500).unwrap();
        
        // Reduce quota to 400 (below already minted)
        state.set_quota(0, 400);
        
        // Can't mint any more
        assert_eq!(state.try_mint(0, 1), Err("quota_exceeded"));
    }
    
    #[test]
    fn test_fuzz_sequence() {
        let ops = vec![
            QuotaOperation::SetQuota { minter_index: 0, quota: 100 },
            QuotaOperation::Mint { minter_index: 0, amount: 50 },
            QuotaOperation::Mint { minter_index: 0, amount: 50 },
            QuotaOperation::Mint { minter_index: 0, amount: 1 }, // Should fail
            QuotaOperation::AdvanceEpoch { hours: 24 },
            QuotaOperation::Mint { minter_index: 0, amount: 100 }, // Should work
        ];
        
        prop_quota_enforced(ops);
    }
}

fn main() {
    println!("Quota Bypass Fuzz Test");
    println!("Testing that minter quotas cannot be bypassed");
    
    // Run basic tests
    let ops = vec![
        QuotaOperation::SetQuota { minter_index: 0, quota: 1000 },
        QuotaOperation::MultiMint {
            minter_index: 0,
            amounts: vec![100, 200, 300, 400, 100],  // Sum = 1100, exceeds 1000
        },
    ];
    
    prop_quota_enforced(ops);
    println!("Basic quota tests passed!");
}
