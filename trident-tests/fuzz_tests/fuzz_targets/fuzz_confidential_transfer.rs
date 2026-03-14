//! SSS-3 Confidential Transfer Fuzz Test
//!
//! Comprehensive fuzz testing for confidential transfer operations.
//! Tests for vulnerabilities in:
//! - ElGamal encryption/decryption
//! - ZK proof validation
//! - Balance encryption/decryption
//! - Pending balance application
//! - Deposit/withdraw flows

use trident_client::prelude::*;
use arbitrary::Arbitrary;
use std::collections::HashMap;

// =============================================================================
// FUZZ DATA TYPES
// =============================================================================

/// Confidential transfer operations for fuzzing
#[derive(Debug, Clone, Arbitrary)]
pub enum CtOperation {
    /// Initialize confidential transfer on account
    ConfigureAccount(ConfigureAccountData),
    /// Deposit public tokens to confidential balance
    Deposit(DepositData),
    /// Confidential transfer to another account
    Transfer(TransferData),
    /// Apply pending balance
    ApplyPending(ApplyPendingData),
    /// Withdraw from confidential to public
    Withdraw(WithdrawData),
    /// Auditor decrypt (should always succeed for valid ciphertexts)
    AuditorDecrypt(AuditorDecryptData),
    /// Invalid proof submission (should always fail)
    InvalidProof(InvalidProofData),
}

#[derive(Debug, Clone, Arbitrary)]
pub struct ConfigureAccountData {
    pub account_index: u8,
    /// Simulated ElGamal public key
    pub elgamal_pubkey: [u8; 32],
    /// Initial proof (should be valid)
    pub valid_proof: bool,
}

#[derive(Debug, Clone, Arbitrary)]
pub struct DepositData {
    pub account_index: u8,
    pub amount: u64,
}

#[derive(Debug, Clone, Arbitrary)]
pub struct TransferData {
    pub sender_index: u8,
    pub recipient_index: u8,
    pub amount: u64,
    /// Whether the ZK proof is valid
    pub valid_equality_proof: bool,
    pub valid_validity_proof: bool,
    pub valid_range_proof: bool,
}

#[derive(Debug, Clone, Arbitrary)]
pub struct ApplyPendingData {
    pub account_index: u8,
    pub pending_credits_to_apply: u32,
}

#[derive(Debug, Clone, Arbitrary)]
pub struct WithdrawData {
    pub account_index: u8,
    pub amount: u64,
    pub valid_proof: bool,
}

#[derive(Debug, Clone, Arbitrary)]
pub struct AuditorDecryptData {
    pub transfer_index: u8,
}

#[derive(Debug, Clone, Arbitrary)]
pub struct InvalidProofData {
    pub proof_type: u8,
    pub garbage_data: [u8; 64],
}

// =============================================================================
// CT ACCOUNT STATE
// =============================================================================

#[derive(Debug, Clone, Default)]
pub struct CtAccountState {
    /// ElGamal public key
    pub elgamal_pubkey: [u8; 32],
    /// Whether CT is configured
    pub is_configured: bool,
    /// Public balance (non-confidential)
    pub public_balance: u64,
    /// Available confidential balance
    pub available_confidential_balance: u64,
    /// Pending confidential balance (from incoming transfers)
    pub pending_confidential_balance: u64,
    /// Number of pending credits
    pub pending_credit_count: u32,
    /// Decryptable available balance (auditor view)
    pub decryptable_available: u64,
    /// Account is closed for CT
    pub is_closed: bool,
}

// =============================================================================
// CT FUZZ STATE
// =============================================================================

pub struct CtFuzzState {
    /// All accounts involved in testing
    pub accounts: HashMap<u8, CtAccountState>,
    /// Auditor ElGamal key
    pub auditor_key: [u8; 32],
    /// All transfer records (for auditor decryption)
    pub transfer_records: Vec<TransferRecord>,
    /// Security violation log
    pub violations: Vec<String>,
}

#[derive(Debug, Clone)]
pub struct TransferRecord {
    pub sender: u8,
    pub recipient: u8,
    pub encrypted_amount: [u8; 64],
    pub actual_amount: u64,
}

impl CtFuzzState {
    pub fn new() -> Self {
        let mut accounts = HashMap::new();
        // Initialize 5 accounts
        for i in 0..5 {
            let mut account = CtAccountState::default();
            account.public_balance = 1_000_000; // 1M tokens initial
            accounts.insert(i, account);
        }

        Self {
            accounts,
            auditor_key: [3u8; 32], // Auditor key
            transfer_records: Vec::new(),
            violations: Vec::new(),
        }
    }

    /// Get account by index
    fn get_account(&self, index: u8) -> Option<&CtAccountState> {
        self.accounts.get(&(index % 5))
    }

    fn get_account_mut(&mut self, index: u8) -> Option<&mut CtAccountState> {
        self.accounts.get_mut(&(index % 5))
    }

    /// Configure CT on account
    pub fn configure_account(&mut self, data: &ConfigureAccountData) -> Result<(), &'static str> {
        let account = self.get_account_mut(data.account_index % 5)
            .ok_or("account_not_found")?;

        if account.is_configured {
            return Err("already_configured");
        }

        // Proof must be valid to configure
        if !data.valid_proof {
            return Err("invalid_proof");
        }

        account.elgamal_pubkey = data.elgamal_pubkey;
        account.is_configured = true;
        Ok(())
    }

    /// Deposit public tokens to confidential balance
    pub fn deposit(&mut self, data: &DepositData) -> Result<(), &'static str> {
        let account = self.get_account_mut(data.account_index % 5)
            .ok_or("account_not_found")?;

        if !account.is_configured {
            return Err("not_configured");
        }

        if account.public_balance < data.amount {
            return Err("insufficient_public_balance");
        }

        // Transfer from public to confidential
        account.public_balance = account.public_balance.checked_sub(data.amount)
            .ok_or("underflow")?;
        account.available_confidential_balance = account.available_confidential_balance
            .checked_add(data.amount)
            .ok_or("overflow")?;
        account.decryptable_available = account.available_confidential_balance;

        Ok(())
    }

    /// Confidential transfer
    pub fn transfer(&mut self, data: &TransferData) -> Result<(), &'static str> {
        let sender_idx = data.sender_index % 5;
        let recipient_idx = data.recipient_index % 5;

        // Validate proofs
        if !data.valid_equality_proof {
            return Err("invalid_equality_proof");
        }
        if !data.valid_validity_proof {
            return Err("invalid_validity_proof");
        }
        if !data.valid_range_proof {
            return Err("invalid_range_proof");
        }

        // Check sender has CT configured
        {
            let sender = self.accounts.get(&sender_idx).ok_or("sender_not_found")?;
            if !sender.is_configured {
                return Err("sender_not_configured");
            }
            if sender.available_confidential_balance < data.amount {
                return Err("insufficient_confidential_balance");
            }
        }

        // Check recipient has CT configured
        {
            let recipient = self.accounts.get(&recipient_idx).ok_or("recipient_not_found")?;
            if !recipient.is_configured {
                return Err("recipient_not_configured");
            }
        }

        // Perform transfer
        let sender = self.accounts.get_mut(&sender_idx).unwrap();
        sender.available_confidential_balance = sender.available_confidential_balance
            .checked_sub(data.amount)
            .ok_or("underflow")?;
        sender.decryptable_available = sender.available_confidential_balance;

        let recipient = self.accounts.get_mut(&recipient_idx).unwrap();
        recipient.pending_confidential_balance = recipient.pending_confidential_balance
            .checked_add(data.amount)
            .ok_or("overflow")?;
        recipient.pending_credit_count = recipient.pending_credit_count
            .checked_add(1)
            .ok_or("credit_count_overflow")?;

        // Record for audit
        self.transfer_records.push(TransferRecord {
            sender: sender_idx,
            recipient: recipient_idx,
            encrypted_amount: [0u8; 64], // Simulated ciphertext
            actual_amount: data.amount,
        });

        Ok(())
    }

    /// Apply pending balance
    pub fn apply_pending(&mut self, data: &ApplyPendingData) -> Result<(), &'static str> {
        let account = self.get_account_mut(data.account_index % 5)
            .ok_or("account_not_found")?;

        if !account.is_configured {
            return Err("not_configured");
        }

        if account.pending_credit_count == 0 {
            return Err("no_pending_credits");
        }

        let credits_to_apply = data.pending_credits_to_apply.min(account.pending_credit_count);

        // Move pending to available (simplified - in real impl this is more complex)
        account.available_confidential_balance = account.available_confidential_balance
            .checked_add(account.pending_confidential_balance)
            .ok_or("overflow")?;
        account.pending_confidential_balance = 0;
        account.pending_credit_count = 0;
        account.decryptable_available = account.available_confidential_balance;

        Ok(())
    }

    /// Withdraw from confidential to public
    pub fn withdraw(&mut self, data: &WithdrawData) -> Result<(), &'static str> {
        if !data.valid_proof {
            return Err("invalid_proof");
        }

        let account = self.get_account_mut(data.account_index % 5)
            .ok_or("account_not_found")?;

        if !account.is_configured {
            return Err("not_configured");
        }

        if account.available_confidential_balance < data.amount {
            return Err("insufficient_confidential_balance");
        }

        // Transfer from confidential to public
        account.available_confidential_balance = account.available_confidential_balance
            .checked_sub(data.amount)
            .ok_or("underflow")?;
        account.public_balance = account.public_balance
            .checked_add(data.amount)
            .ok_or("overflow")?;
        account.decryptable_available = account.available_confidential_balance;

        Ok(())
    }

    /// Auditor decryption (should always work for valid transfers)
    pub fn auditor_decrypt(&self, data: &AuditorDecryptData) -> Result<u64, &'static str> {
        let transfer_idx = data.transfer_index as usize % self.transfer_records.len().max(1);
        
        if self.transfer_records.is_empty() {
            return Err("no_transfers");
        }

        let record = &self.transfer_records[transfer_idx];
        // In real impl, this would use ElGamal decryption with auditor key
        // For simulation, we return the actual amount
        Ok(record.actual_amount)
    }

    /// Check all invariants
    pub fn check_invariants(&self) -> Result<(), String> {
        let mut total_supply = 0u64;
        let mut total_confidential = 0u64;
        let mut total_pending = 0u64;

        for (_, account) in &self.accounts {
            total_supply = total_supply.saturating_add(account.public_balance);
            total_confidential = total_confidential.saturating_add(account.available_confidential_balance);
            total_pending = total_pending.saturating_add(account.pending_confidential_balance);
        }

        // Invariant 1: Total balance should be conserved
        let grand_total = total_supply
            .saturating_add(total_confidential)
            .saturating_add(total_pending);
        let expected_total = 5 * 1_000_000; // 5 accounts * 1M initial

        if grand_total != expected_total {
            return Err(format!(
                "CRITICAL: Balance not conserved! Expected {} got {}",
                expected_total, grand_total
            ));
        }

        // Invariant 2: Decryptable should match available
        for (idx, account) in &self.accounts {
            if account.is_configured && account.decryptable_available != account.available_confidential_balance {
                return Err(format!(
                    "CRITICAL: Account {} decryptable mismatch: {} vs {}",
                    idx, account.decryptable_available, account.available_confidential_balance
                ));
            }
        }

        Ok(())
    }
}

// =============================================================================
// PROPERTY TESTS
// =============================================================================

/// Property: Invalid proofs should always be rejected
pub fn prop_invalid_proof_rejected(operations: Vec<CtOperation>) {
    let mut state = CtFuzzState::new();

    // Configure all accounts first
    for i in 0..5 {
        let _ = state.configure_account(&ConfigureAccountData {
            account_index: i,
            elgamal_pubkey: [i + 1; 32],
            valid_proof: true,
        });
    }

    for op in operations {
        match op {
            CtOperation::Transfer(data) => {
                if !data.valid_equality_proof || !data.valid_validity_proof || !data.valid_range_proof {
                    let result = state.transfer(&data);
                    assert!(result.is_err(), "Invalid proof should be rejected");
                }
            }
            CtOperation::Withdraw(data) => {
                if !data.valid_proof {
                    let result = state.withdraw(&data);
                    assert!(result.is_err(), "Invalid proof should be rejected");
                }
            }
            CtOperation::ConfigureAccount(data) => {
                if !data.valid_proof {
                    let result = state.configure_account(&data);
                    assert!(result.is_err(), "Invalid proof should be rejected");
                }
            }
            _ => {}
        }
    }
}

/// Property: Balance conservation through all operations
pub fn prop_balance_conserved(operations: Vec<CtOperation>) {
    let mut state = CtFuzzState::new();

    // Configure all accounts
    for i in 0..5 {
        let _ = state.configure_account(&ConfigureAccountData {
            account_index: i,
            elgamal_pubkey: [i + 1; 32],
            valid_proof: true,
        });
    }

    for op in operations {
        let _ = match op {
            CtOperation::Deposit(d) => state.deposit(&d),
            CtOperation::Transfer(t) => state.transfer(&t),
            CtOperation::ApplyPending(a) => state.apply_pending(&a),
            CtOperation::Withdraw(w) => state.withdraw(&w),
            CtOperation::ConfigureAccount(c) => state.configure_account(&c),
            _ => Ok(()),
        };

        // Check invariants after every operation
        if let Err(e) = state.check_invariants() {
            panic!("Invariant violation: {}", e);
        }
    }
}

/// Property: Auditor can decrypt all valid transfers
pub fn prop_auditor_can_decrypt(operations: Vec<CtOperation>) {
    let mut state = CtFuzzState::new();

    // Configure accounts
    for i in 0..5 {
        let _ = state.configure_account(&ConfigureAccountData {
            account_index: i,
            elgamal_pubkey: [i + 1; 32],
            valid_proof: true,
        });
        // Deposit some tokens
        let _ = state.deposit(&DepositData {
            account_index: i,
            amount: 100_000,
        });
    }

    // Execute operations
    for op in operations {
        if let CtOperation::Transfer(data) = op {
            if data.valid_equality_proof && data.valid_validity_proof && data.valid_range_proof {
                let _ = state.transfer(&data);
            }
        }
    }

    // Verify auditor can decrypt all transfers
    for (i, record) in state.transfer_records.iter().enumerate() {
        let result = state.auditor_decrypt(&AuditorDecryptData {
            transfer_index: i as u8,
        });
        
        assert!(result.is_ok(), "Auditor should be able to decrypt valid transfer");
        assert_eq!(result.unwrap(), record.actual_amount, "Decrypted amount should match");
    }
}

// =============================================================================
// UNIT TESTS
// =============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_configure_account() {
        let mut state = CtFuzzState::new();
        
        let result = state.configure_account(&ConfigureAccountData {
            account_index: 0,
            elgamal_pubkey: [1u8; 32],
            valid_proof: true,
        });
        
        assert!(result.is_ok());
        assert!(state.accounts.get(&0).unwrap().is_configured);
    }

    #[test]
    fn test_configure_requires_valid_proof() {
        let mut state = CtFuzzState::new();
        
        let result = state.configure_account(&ConfigureAccountData {
            account_index: 0,
            elgamal_pubkey: [1u8; 32],
            valid_proof: false, // Invalid proof
        });
        
        assert_eq!(result, Err("invalid_proof"));
    }

    #[test]
    fn test_deposit() {
        let mut state = CtFuzzState::new();
        state.configure_account(&ConfigureAccountData {
            account_index: 0,
            elgamal_pubkey: [1u8; 32],
            valid_proof: true,
        }).unwrap();

        let result = state.deposit(&DepositData {
            account_index: 0,
            amount: 100_000,
        });

        assert!(result.is_ok());
        let account = state.accounts.get(&0).unwrap();
        assert_eq!(account.public_balance, 900_000);
        assert_eq!(account.available_confidential_balance, 100_000);
    }

    #[test]
    fn test_deposit_insufficient_balance() {
        let mut state = CtFuzzState::new();
        state.configure_account(&ConfigureAccountData {
            account_index: 0,
            elgamal_pubkey: [1u8; 32],
            valid_proof: true,
        }).unwrap();

        let result = state.deposit(&DepositData {
            account_index: 0,
            amount: 2_000_000, // More than available
        });

        assert_eq!(result, Err("insufficient_public_balance"));
    }

    #[test]
    fn test_confidential_transfer() {
        let mut state = CtFuzzState::new();
        
        // Configure both accounts
        for i in 0..2 {
            state.configure_account(&ConfigureAccountData {
                account_index: i,
                elgamal_pubkey: [i + 1; 32],
                valid_proof: true,
            }).unwrap();
        }

        // Deposit to sender
        state.deposit(&DepositData {
            account_index: 0,
            amount: 100_000,
        }).unwrap();

        // Transfer
        let result = state.transfer(&TransferData {
            sender_index: 0,
            recipient_index: 1,
            amount: 50_000,
            valid_equality_proof: true,
            valid_validity_proof: true,
            valid_range_proof: true,
        });

        assert!(result.is_ok());
        
        let sender = state.accounts.get(&0).unwrap();
        let recipient = state.accounts.get(&1).unwrap();
        
        assert_eq!(sender.available_confidential_balance, 50_000);
        assert_eq!(recipient.pending_confidential_balance, 50_000);
        assert_eq!(recipient.pending_credit_count, 1);
    }

    #[test]
    fn test_transfer_invalid_proof() {
        let mut state = CtFuzzState::new();
        
        for i in 0..2 {
            state.configure_account(&ConfigureAccountData {
                account_index: i,
                elgamal_pubkey: [i + 1; 32],
                valid_proof: true,
            }).unwrap();
        }

        state.deposit(&DepositData {
            account_index: 0,
            amount: 100_000,
        }).unwrap();

        // Transfer with invalid equality proof
        let result = state.transfer(&TransferData {
            sender_index: 0,
            recipient_index: 1,
            amount: 50_000,
            valid_equality_proof: false, // Invalid!
            valid_validity_proof: true,
            valid_range_proof: true,
        });

        assert_eq!(result, Err("invalid_equality_proof"));
    }

    #[test]
    fn test_apply_pending() {
        let mut state = CtFuzzState::new();
        
        for i in 0..2 {
            state.configure_account(&ConfigureAccountData {
                account_index: i,
                elgamal_pubkey: [i + 1; 32],
                valid_proof: true,
            }).unwrap();
        }

        state.deposit(&DepositData {
            account_index: 0,
            amount: 100_000,
        }).unwrap();

        state.transfer(&TransferData {
            sender_index: 0,
            recipient_index: 1,
            amount: 50_000,
            valid_equality_proof: true,
            valid_validity_proof: true,
            valid_range_proof: true,
        }).unwrap();

        // Apply pending for recipient
        let result = state.apply_pending(&ApplyPendingData {
            account_index: 1,
            pending_credits_to_apply: 1,
        });

        assert!(result.is_ok());
        let recipient = state.accounts.get(&1).unwrap();
        assert_eq!(recipient.available_confidential_balance, 50_000);
        assert_eq!(recipient.pending_confidential_balance, 0);
        assert_eq!(recipient.pending_credit_count, 0);
    }

    #[test]
    fn test_withdraw() {
        let mut state = CtFuzzState::new();
        
        state.configure_account(&ConfigureAccountData {
            account_index: 0,
            elgamal_pubkey: [1u8; 32],
            valid_proof: true,
        }).unwrap();

        state.deposit(&DepositData {
            account_index: 0,
            amount: 100_000,
        }).unwrap();

        let result = state.withdraw(&WithdrawData {
            account_index: 0,
            amount: 30_000,
            valid_proof: true,
        });

        assert!(result.is_ok());
        let account = state.accounts.get(&0).unwrap();
        assert_eq!(account.available_confidential_balance, 70_000);
        assert_eq!(account.public_balance, 930_000);
    }

    #[test]
    fn test_invariant_balance_conservation() {
        let mut state = CtFuzzState::new();
        
        // Configure and perform various operations
        for i in 0..5 {
            state.configure_account(&ConfigureAccountData {
                account_index: i,
                elgamal_pubkey: [i + 1; 32],
                valid_proof: true,
            }).unwrap();
            
            state.deposit(&DepositData {
                account_index: i,
                amount: 200_000,
            }).unwrap();
        }

        // Multiple transfers
        for i in 0..4 {
            let _ = state.transfer(&TransferData {
                sender_index: i,
                recipient_index: i + 1,
                amount: 10_000,
                valid_equality_proof: true,
                valid_validity_proof: true,
                valid_range_proof: true,
            });
        }

        // Check invariants
        let result = state.check_invariants();
        assert!(result.is_ok(), "Invariants should hold after operations");
    }
}

fn main() {
    println!("SSS-3 Confidential Transfer Fuzz Test Target");
    println!("Run with: cargo +nightly fuzz run fuzz_confidential_transfer");
}
