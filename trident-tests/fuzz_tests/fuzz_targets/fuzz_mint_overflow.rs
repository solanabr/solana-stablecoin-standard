//! Mint Overflow Fuzz Test
//!
//! Tests for arithmetic overflow vulnerabilities in minting operations.
//! Attempts to find sequences that could cause total_minted to overflow.

use trident_client::prelude::*;
use arbitrary::Arbitrary;

/// Fuzz data targeting overflow conditions
#[derive(Debug, Clone, Arbitrary)]
pub struct OverflowAttempt {
    /// Amount to mint (arbitrary u64)
    pub amount: u64,
    /// Number of sequential mints to attempt
    pub iterations: u8,
    /// Whether to reset epoch between mints
    pub reset_epoch: bool,
}

/// State for overflow testing
pub struct OverflowState {
    pub total_minted: u64,
    pub supply_cap: u64,
}

impl OverflowState {
    pub fn new() -> Self {
        Self {
            total_minted: 0,
            supply_cap: u64::MAX, // No cap for overflow testing
        }
    }
    
    /// Attempt to mint with overflow check
    pub fn try_mint(&mut self, amount: u64) -> Result<(), &'static str> {
        // This should use checked_add to prevent overflow
        match self.total_minted.checked_add(amount) {
            Some(new_total) => {
                if new_total > self.supply_cap {
                    return Err("supply_cap_exceeded");
                }
                self.total_minted = new_total;
                Ok(())
            }
            None => Err("overflow_detected"),
        }
    }
    
    /// Unsafe mint (what we're testing against)
    pub fn unsafe_mint(&mut self, amount: u64) {
        // BAD: This could overflow!
        self.total_minted = self.total_minted.wrapping_add(amount);
    }
}

/// Property: checked_add should catch all overflows
pub fn prop_no_overflow(attempts: Vec<OverflowAttempt>) {
    let mut state = OverflowState::new();
    
    for attempt in attempts {
        for _ in 0..attempt.iterations.min(10) {
            let result = state.try_mint(attempt.amount);
            
            // If we get an overflow error, that's expected
            // If we don't, verify no wrap-around occurred
            if result.is_ok() {
                // Invariant: total_minted should be monotonically increasing
                // If it wrapped, this would fail
                assert!(
                    state.total_minted >= attempt.amount,
                    "Overflow detected! total_minted wrapped around"
                );
            }
        }
    }
}

/// Test edge cases
#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_max_mint() {
        let mut state = OverflowState::new();
        
        // Mint max value
        let result = state.try_mint(u64::MAX);
        assert!(result.is_ok());
        assert_eq!(state.total_minted, u64::MAX);
        
        // Any additional mint should fail
        let result = state.try_mint(1);
        assert_eq!(result, Err("overflow_detected"));
    }
    
    #[test]
    fn test_near_max() {
        let mut state = OverflowState::new();
        state.total_minted = u64::MAX - 100;
        
        // This should succeed
        let result = state.try_mint(100);
        assert!(result.is_ok());
        
        // This should fail
        let result = state.try_mint(1);
        assert_eq!(result, Err("overflow_detected"));
    }
    
    #[test]
    fn test_many_small_mints() {
        let mut state = OverflowState::new();
        state.total_minted = u64::MAX - 1000;
        
        // 1000 mints of 1 should succeed
        for i in 0..1000 {
            let result = state.try_mint(1);
            assert!(result.is_ok(), "Failed at iteration {}", i);
        }
        
        // 1001st should fail
        let result = state.try_mint(1);
        assert_eq!(result, Err("overflow_detected"));
    }
    
    #[test]
    fn test_overflow_sequence() {
        // Attempt various overflow-inducing sequences
        let sequences = vec![
            vec![u64::MAX / 2, u64::MAX / 2, 2],
            vec![u64::MAX - 1, 2],
            vec![1 << 63, 1 << 63],
        ];
        
        for seq in sequences {
            let mut state = OverflowState::new();
            let mut last_total = 0u64;
            
            for amount in seq {
                let result = state.try_mint(amount);
                
                if result.is_ok() {
                    // Verify monotonic increase
                    assert!(
                        state.total_minted >= last_total,
                        "Overflow! total went from {} to {}",
                        last_total,
                        state.total_minted
                    );
                    last_total = state.total_minted;
                }
            }
        }
    }
}

fn main() {
    println!("Mint Overflow Fuzz Test");
    println!("Testing arithmetic overflow protection in mint operations");
    
    // Run basic property test
    let test_data = vec![
        OverflowAttempt {
            amount: u64::MAX / 3,
            iterations: 5,
            reset_epoch: false,
        },
    ];
    
    prop_no_overflow(test_data);
    println!("Basic overflow tests passed!");
}
