//! Burn Underflow Fuzz Test
//!
//! Tests for arithmetic underflow vulnerabilities in burn operations.
//! Attempts to find sequences that could cause total_burned > total_minted.

use trident_client::prelude::*;
use arbitrary::Arbitrary;

/// Fuzz data targeting underflow conditions
#[derive(Debug, Clone, Arbitrary)]
pub struct UnderflowAttempt {
    /// Amounts to mint before burning
    pub mint_amounts: Vec<u64>,
    /// Amounts to burn
    pub burn_amounts: Vec<u64>,
    /// Whether operations are interleaved
    pub interleaved: bool,
}

/// State for underflow testing
#[derive(Debug, Clone)]
pub struct UnderflowState {
    pub total_minted: u64,
    pub total_burned: u64,
}

impl UnderflowState {
    pub fn new() -> Self {
        Self {
            total_minted: 0,
            total_burned: 0,
        }
    }
    
    pub fn current_supply(&self) -> u64 {
        // This should never underflow if checks are correct
        self.total_minted.saturating_sub(self.total_burned)
    }
    
    /// Safe mint
    pub fn mint(&mut self, amount: u64) -> Result<(), &'static str> {
        match self.total_minted.checked_add(amount) {
            Some(new_total) => {
                self.total_minted = new_total;
                Ok(())
            }
            None => Err("mint_overflow"),
        }
    }
    
    /// Safe burn with underflow check
    pub fn try_burn(&mut self, amount: u64) -> Result<(), &'static str> {
        // Check 1: Can't burn more than exists
        if amount > self.current_supply() {
            return Err("insufficient_supply");
        }
        
        // Check 2: Ensure no underflow in total_burned tracking
        match self.total_burned.checked_add(amount) {
            Some(new_burned) => {
                // Verify invariant holds
                if new_burned > self.total_minted {
                    return Err("underflow_detected");
                }
                self.total_burned = new_burned;
                Ok(())
            }
            None => Err("burned_counter_overflow"),
        }
    }
    
    /// Check invariants
    pub fn check_invariants(&self) -> Result<(), &'static str> {
        // Invariant 1: total_burned <= total_minted
        if self.total_burned > self.total_minted {
            return Err("CRITICAL: total_burned > total_minted");
        }
        
        // Invariant 2: current_supply is non-negative (implicit by u64)
        // This would manifest as total_burned > total_minted
        
        Ok(())
    }
}

/// Property test: No sequence should cause underflow
pub fn prop_no_underflow(attempt: UnderflowAttempt) {
    let mut state = UnderflowState::new();
    
    if attempt.interleaved {
        // Interleaved mint/burn operations
        let max_len = attempt.mint_amounts.len().max(attempt.burn_amounts.len());
        
        for i in 0..max_len {
            if let Some(&mint_amount) = attempt.mint_amounts.get(i) {
                let _ = state.mint(mint_amount);
            }
            
            if let Some(&burn_amount) = attempt.burn_amounts.get(i) {
                let _ = state.try_burn(burn_amount);
            }
            
            // Check invariants after each operation
            state.check_invariants().expect("Invariant violated!");
        }
    } else {
        // All mints first, then all burns
        for &amount in &attempt.mint_amounts {
            let _ = state.mint(amount);
        }
        
        for &amount in &attempt.burn_amounts {
            let result = state.try_burn(amount);
            
            // Even if burn fails, invariants should hold
            state.check_invariants().expect("Invariant violated after burn!");
            
            if result.is_err() {
                // Expected - can't burn more than supply
            }
        }
    }
}

/// Edge case tests
#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_burn_more_than_supply() {
        let mut state = UnderflowState::new();
        
        // Mint 1000
        state.mint(1000).unwrap();
        
        // Try to burn 1001 - should fail
        let result = state.try_burn(1001);
        assert_eq!(result, Err("insufficient_supply"));
        
        // State should be unchanged
        assert_eq!(state.total_minted, 1000);
        assert_eq!(state.total_burned, 0);
    }
    
    #[test]
    fn test_burn_exact_supply() {
        let mut state = UnderflowState::new();
        
        state.mint(1000).unwrap();
        state.try_burn(1000).unwrap();
        
        assert_eq!(state.current_supply(), 0);
        assert_eq!(state.total_minted, 1000);
        assert_eq!(state.total_burned, 1000);
    }
    
    #[test]
    fn test_repeated_mint_burn() {
        let mut state = UnderflowState::new();
        
        for _ in 0..100 {
            state.mint(100).unwrap();
            state.try_burn(50).unwrap();
            
            state.check_invariants().unwrap();
        }
        
        // Should have accumulated 5000
        assert_eq!(state.current_supply(), 5000);
    }
    
    #[test]
    fn test_interleaved_underflow_attempt() {
        // Try to trigger underflow with interleaved ops
        let attempt = UnderflowAttempt {
            mint_amounts: vec![100, 100, 100],
            burn_amounts: vec![150, 150, 150],  // Tries to burn more than exists
            interleaved: true,
        };
        
        // Should not panic
        prop_no_underflow(attempt);
    }
    
    #[test]
    fn test_large_values() {
        let mut state = UnderflowState::new();
        
        // Mint large amount
        state.mint(u64::MAX / 2).unwrap();
        
        // Burn same amount
        state.try_burn(u64::MAX / 2).unwrap();
        
        assert_eq!(state.current_supply(), 0);
        state.check_invariants().unwrap();
    }
    
    #[test]
    fn test_zero_operations() {
        let mut state = UnderflowState::new();
        
        // Zero mint should work
        state.mint(0).unwrap();
        
        // Zero burn should work
        state.try_burn(0).unwrap();
        
        assert_eq!(state.current_supply(), 0);
    }
    
    #[test]
    fn test_burn_counter_overflow() {
        let mut state = UnderflowState::new();
        
        // Mint max
        state.mint(u64::MAX).unwrap();
        
        // Burn max
        state.try_burn(u64::MAX).unwrap();
        
        // Try to burn again (burned counter would overflow)
        state.mint(1000).unwrap();
        
        // This should fail because total_burned is already MAX
        let result = state.try_burn(1000);
        assert_eq!(result, Err("burned_counter_overflow"));
    }
}

fn main() {
    println!("Burn Underflow Fuzz Test");
    println!("Testing arithmetic underflow protection in burn operations");
    
    // Run basic tests
    let test_cases = vec![
        UnderflowAttempt {
            mint_amounts: vec![1000, 2000],
            burn_amounts: vec![3000, 1],  // Tries to burn all + 1
            interleaved: false,
        },
        UnderflowAttempt {
            mint_amounts: vec![100],
            burn_amounts: vec![50, 51],  // Second burn exceeds
            interleaved: false,
        },
    ];
    
    for attempt in test_cases {
        prop_no_underflow(attempt);
    }
    
    println!("Basic underflow tests passed!");
}
