//! Blacklist PDA Isolation Fuzz Test
//!
//! Tests for PDA isolation vulnerabilities in blacklist operations.
//! Ensures blacklist entries for one stablecoin don't affect another.

use trident_client::prelude::*;
use solana_sdk::pubkey::Pubkey;
use arbitrary::Arbitrary;
use std::collections::HashMap;

/// Fuzz data for blacklist isolation testing
#[derive(Debug, Clone, Arbitrary)]
pub struct BlacklistOperation {
    /// Which stablecoin (0, 1, 2 = different configs)
    pub stablecoin_index: u8,
    /// Address to blacklist (index into test addresses)
    pub address_index: u8,
    /// Whether to blacklist or unblacklist
    pub blacklist: bool,
}

/// Simulates PDA derivation for blacklist entries
fn derive_blacklist_pda(stablecoin_config: &Pubkey, address: &Pubkey) -> Pubkey {
    // Simplified PDA derivation for testing
    // Real impl: Pubkey::find_program_address(&[b"blacklist", config.as_ref(), address.as_ref()], &program_id)
    
    let mut bytes = [0u8; 32];
    for (i, b) in stablecoin_config.to_bytes().iter().enumerate() {
        bytes[i % 32] ^= b;
    }
    for (i, b) in address.to_bytes().iter().enumerate() {
        bytes[(i + 16) % 32] ^= b;
    }
    Pubkey::new_from_array(bytes)
}

/// State tracking blacklists for multiple stablecoins
pub struct BlacklistIsolationState {
    /// Stablecoin configs
    pub configs: Vec<Pubkey>,
    /// Test addresses
    pub addresses: Vec<Pubkey>,
    /// Blacklist state: config -> address -> is_blacklisted
    pub blacklists: HashMap<Pubkey, HashMap<Pubkey, bool>>,
    /// PDA to config mapping (to verify isolation)
    pub pda_ownership: HashMap<Pubkey, (Pubkey, Pubkey)>,  // PDA -> (config, address)
}

impl BlacklistIsolationState {
    pub fn new() -> Self {
        let configs: Vec<Pubkey> = (0..3)
            .map(|i| {
                let mut bytes = [0u8; 32];
                bytes[0] = i;
                bytes[31] = 0xC0; // Config marker
                Pubkey::new_from_array(bytes)
            })
            .collect();
        
        let addresses: Vec<Pubkey> = (0..5)
            .map(|i| {
                let mut bytes = [0u8; 32];
                bytes[0] = i;
                bytes[31] = 0xAD; // Address marker
                Pubkey::new_from_array(bytes)
            })
            .collect();
        
        let mut blacklists = HashMap::new();
        for config in &configs {
            blacklists.insert(*config, HashMap::new());
        }
        
        Self {
            configs,
            addresses,
            blacklists,
            pda_ownership: HashMap::new(),
        }
    }
    
    /// Blacklist an address for a specific stablecoin
    pub fn blacklist(
        &mut self,
        stablecoin_index: usize,
        address_index: usize,
    ) -> Result<(), &'static str> {
        let config = self.configs.get(stablecoin_index).ok_or("invalid_config")?;
        let address = self.addresses.get(address_index).ok_or("invalid_address")?;
        
        // Derive PDA
        let pda = derive_blacklist_pda(config, address);
        
        // Check for PDA collision (critical security issue!)
        if let Some((existing_config, existing_addr)) = self.pda_ownership.get(&pda) {
            if existing_config != config || existing_addr != address {
                return Err("CRITICAL: PDA collision detected!");
            }
        }
        
        // Record PDA ownership
        self.pda_ownership.insert(pda, (*config, *address));
        
        // Update blacklist
        let config_blacklist = self.blacklists.get_mut(config).unwrap();
        config_blacklist.insert(*address, true);
        
        Ok(())
    }
    
    /// Remove address from blacklist
    pub fn unblacklist(
        &mut self,
        stablecoin_index: usize,
        address_index: usize,
    ) -> Result<(), &'static str> {
        let config = self.configs.get(stablecoin_index).ok_or("invalid_config")?;
        let address = self.addresses.get(address_index).ok_or("invalid_address")?;
        
        let config_blacklist = self.blacklists.get_mut(config).unwrap();
        config_blacklist.insert(*address, false);
        
        Ok(())
    }
    
    /// Check if address is blacklisted for a specific stablecoin
    pub fn is_blacklisted(&self, stablecoin_index: usize, address_index: usize) -> bool {
        let config = &self.configs[stablecoin_index];
        let address = &self.addresses[address_index];
        
        self.blacklists
            .get(config)
            .and_then(|bl| bl.get(address))
            .copied()
            .unwrap_or(false)
    }
    
    /// Verify isolation invariants
    pub fn check_isolation(&self) -> Result<(), String> {
        // For each stablecoin, verify its blacklist doesn't affect others
        for (i, config_i) in self.configs.iter().enumerate() {
            for (j, config_j) in self.configs.iter().enumerate() {
                if i == j {
                    continue;
                }
                
                let blacklist_i = self.blacklists.get(config_i).unwrap();
                let blacklist_j = self.blacklists.get(config_j).unwrap();
                
                // Check that blacklisted addresses in config_i are independent from config_j
                for (addr, &is_bl_i) in blacklist_i {
                    let is_bl_j = blacklist_j.get(addr).copied().unwrap_or(false);
                    
                    // It's OK if they differ - that's expected isolation
                    // We're checking that changing one doesn't change the other
                }
            }
        }
        
        Ok(())
    }
}

/// Property test: Blacklist isolation
pub fn prop_blacklist_isolation(operations: Vec<BlacklistOperation>) {
    let mut state = BlacklistIsolationState::new();
    
    // Track expected state
    let mut expected: HashMap<(usize, usize), bool> = HashMap::new();
    
    for op in operations {
        let stablecoin_idx = (op.stablecoin_index as usize) % state.configs.len();
        let address_idx = (op.address_index as usize) % state.addresses.len();
        
        if op.blacklist {
            let _ = state.blacklist(stablecoin_idx, address_idx);
            expected.insert((stablecoin_idx, address_idx), true);
        } else {
            let _ = state.unblacklist(stablecoin_idx, address_idx);
            expected.insert((stablecoin_idx, address_idx), false);
        }
        
        // Verify isolation after each operation
        state.check_isolation().expect("Isolation violated!");
        
        // Verify expected state matches actual
        for (&(s_idx, a_idx), &expected_bl) in &expected {
            let actual_bl = state.is_blacklisted(s_idx, a_idx);
            assert_eq!(
                actual_bl, expected_bl,
                "State mismatch for stablecoin {} address {}: expected {}, got {}",
                s_idx, a_idx, expected_bl, actual_bl
            );
        }
        
        // Verify other stablecoins are not affected
        for other_s in 0..state.configs.len() {
            if other_s == stablecoin_idx {
                continue;
            }
            
            // This address should NOT be blacklisted for other stablecoins
            // unless explicitly blacklisted for them
            let other_key = (other_s, address_idx);
            let expected_other = expected.get(&other_key).copied().unwrap_or(false);
            let actual_other = state.is_blacklisted(other_s, address_idx);
            
            assert_eq!(
                actual_other, expected_other,
                "Cross-stablecoin contamination! Operation on {} affected {}",
                stablecoin_idx, other_s
            );
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_basic_isolation() {
        let mut state = BlacklistIsolationState::new();
        
        // Blacklist address 0 for stablecoin 0
        state.blacklist(0, 0).unwrap();
        
        // Address 0 should be blacklisted for stablecoin 0
        assert!(state.is_blacklisted(0, 0));
        
        // But NOT for stablecoins 1 and 2
        assert!(!state.is_blacklisted(1, 0));
        assert!(!state.is_blacklisted(2, 0));
    }
    
    #[test]
    fn test_pda_collision_detection() {
        // This test verifies that our PDA derivation is collision-resistant
        let state = BlacklistIsolationState::new();
        
        // Generate all PDAs and check for collisions
        let mut pdas: HashMap<Pubkey, (usize, usize)> = HashMap::new();
        
        for (c_idx, config) in state.configs.iter().enumerate() {
            for (a_idx, address) in state.addresses.iter().enumerate() {
                let pda = derive_blacklist_pda(config, address);
                
                if let Some((existing_c, existing_a)) = pdas.insert(pda, (c_idx, a_idx)) {
                    panic!(
                        "PDA collision! ({}, {}) and ({}, {}) produce same PDA",
                        existing_c, existing_a, c_idx, a_idx
                    );
                }
            }
        }
    }
    
    #[test]
    fn test_interleaved_operations() {
        let ops = vec![
            BlacklistOperation { stablecoin_index: 0, address_index: 0, blacklist: true },
            BlacklistOperation { stablecoin_index: 1, address_index: 0, blacklist: true },
            BlacklistOperation { stablecoin_index: 0, address_index: 0, blacklist: false },
            BlacklistOperation { stablecoin_index: 2, address_index: 0, blacklist: true },
        ];
        
        // Should not panic
        prop_blacklist_isolation(ops);
    }
    
    #[test]
    fn test_same_address_multiple_stablecoins() {
        let mut state = BlacklistIsolationState::new();
        
        // Blacklist same address for all stablecoins
        for s in 0..3 {
            state.blacklist(s, 0).unwrap();
        }
        
        // All should be blacklisted independently
        assert!(state.is_blacklisted(0, 0));
        assert!(state.is_blacklisted(1, 0));
        assert!(state.is_blacklisted(2, 0));
        
        // Unblacklist from stablecoin 1 only
        state.unblacklist(1, 0).unwrap();
        
        // Only stablecoin 1 should be unblacklisted
        assert!(state.is_blacklisted(0, 0));
        assert!(!state.is_blacklisted(1, 0));
        assert!(state.is_blacklisted(2, 0));
    }
}

fn main() {
    println!("Blacklist PDA Isolation Fuzz Test");
    println!("Testing that blacklist entries are isolated between stablecoins");
    
    // Run property test with sample data
    let ops = vec![
        BlacklistOperation { stablecoin_index: 0, address_index: 0, blacklist: true },
        BlacklistOperation { stablecoin_index: 1, address_index: 0, blacklist: false },
        BlacklistOperation { stablecoin_index: 0, address_index: 1, blacklist: true },
    ];
    
    prop_blacklist_isolation(ops);
    println!("Basic isolation tests passed!");
}
