//! Account snapshots for invariant checking.
//!
//! Before and after each fuzzed instruction, we snapshot the on-chain state
//! to verify invariants hold across state transitions.

use anchor_lang::prelude::Pubkey;

/// Snapshot of StablecoinConfig state before/after an instruction
#[derive(Debug, Clone, Default)]
pub struct ConfigSnapshot {
    pub admin: Pubkey,
    pub pending_admin: Pubkey,
    pub mint: Pubkey,
    pub preset: u8,
    pub paused: bool,
    pub total_minted: u64,
    pub total_burned: u64,
    pub total_seized: u64,
    pub treasury: Pubkey,
    pub transfer_hook_program: Pubkey,
}

/// Snapshot of RoleAccount state
#[derive(Debug, Clone, Default)]
pub struct RoleSnapshot {
    pub holder: Pubkey,
    pub role: u8,
    pub allowance: u64,
    pub exists: bool,
}

/// Pre/post snapshot pair for invariant checking
#[derive(Debug, Clone)]
pub struct InvariantSnapshot {
    pub pre: ConfigSnapshot,
    pub post: ConfigSnapshot,
    pub pre_role: Option<RoleSnapshot>,
    pub post_role: Option<RoleSnapshot>,
}

impl InvariantSnapshot {
    /// Check all supply invariants between pre and post state
    pub fn verify_supply_invariants(&self) {
        // Supply can only increase via mint_to or seize (mint to treasury)
        // Supply can only decrease via burn_from or seize (burn from source)
        assert!(
            self.post.total_minted >= self.pre.total_minted,
            "total_minted decreased: {} -> {}",
            self.pre.total_minted,
            self.post.total_minted
        );
        assert!(
            self.post.total_burned >= self.pre.total_burned,
            "total_burned decreased: {} -> {}",
            self.pre.total_burned,
            self.post.total_burned
        );
        assert!(
            self.post.total_seized >= self.pre.total_seized,
            "total_seized decreased: {} -> {}",
            self.pre.total_seized,
            self.post.total_seized
        );
    }

    /// Verify seize increments all three counters by the same amount
    pub fn verify_seize_counters(&self, seize_amount: u64) {
        let minted_delta = self.post.total_minted - self.pre.total_minted;
        let burned_delta = self.post.total_burned - self.pre.total_burned;
        let seized_delta = self.post.total_seized - self.pre.total_seized;

        assert_eq!(
            minted_delta, seize_amount,
            "Seize: total_minted delta ({}) != seize amount ({})",
            minted_delta, seize_amount
        );
        assert_eq!(
            burned_delta, seize_amount,
            "Seize: total_burned delta ({}) != seize amount ({})",
            burned_delta, seize_amount
        );
        assert_eq!(
            seized_delta, seize_amount,
            "Seize: total_seized delta ({}) != seize amount ({})",
            seized_delta, seize_amount
        );
    }

    /// Verify mint only increments total_minted
    pub fn verify_mint_counters(&self, mint_amount: u64) {
        let minted_delta = self.post.total_minted - self.pre.total_minted;
        assert_eq!(
            minted_delta, mint_amount,
            "Mint: total_minted delta ({}) != mint amount ({})",
            minted_delta, mint_amount
        );
        assert_eq!(
            self.post.total_burned, self.pre.total_burned,
            "Mint: total_burned should not change"
        );
        assert_eq!(
            self.post.total_seized, self.pre.total_seized,
            "Mint: total_seized should not change"
        );
    }

    /// Verify burn only increments total_burned
    pub fn verify_burn_counters(&self, burn_amount: u64) {
        let burned_delta = self.post.total_burned - self.pre.total_burned;
        assert_eq!(
            burned_delta, burn_amount,
            "Burn: total_burned delta ({}) != burn amount ({})",
            burned_delta, burn_amount
        );
        assert_eq!(
            self.post.total_minted, self.pre.total_minted,
            "Burn: total_minted should not change"
        );
        assert_eq!(
            self.post.total_seized, self.pre.total_seized,
            "Burn: total_seized should not change"
        );
    }

    /// Verify allowance decrements on mint
    pub fn verify_allowance_decrement(&self, minted: u64) {
        if let (Some(pre_role), Some(post_role)) = (&self.pre_role, &self.post_role) {
            assert_eq!(
                post_role.allowance,
                pre_role.allowance - minted,
                "Allowance: expected {} - {} = {}, got {}",
                pre_role.allowance,
                minted,
                pre_role.allowance - minted,
                post_role.allowance
            );
        }
    }

    /// Verify admin did not change (for non-admin-transfer instructions)
    pub fn verify_admin_unchanged(&self) {
        assert_eq!(
            self.post.admin, self.pre.admin,
            "Admin changed unexpectedly"
        );
    }

    /// Verify pause state toggled
    pub fn verify_pause_toggled(&self) {
        assert_ne!(
            self.post.paused, self.pre.paused,
            "Pause state did not toggle"
        );
    }
}
