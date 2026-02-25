use anchor_lang::prelude::*;

#[account]
pub struct StablecoinConfig {
    pub authority: Pubkey,
    pub mint: Pubkey,
    pub preset: u8,
    pub paused: bool,
    pub supply_cap: Option<u64>,
    pub total_minted: u64,
    pub total_burned: u64,
    pub bump: u8,
    /// Stablecoin name (max 32 chars).
    pub name: String,
    /// Stablecoin ticker symbol (max 10 chars).
    pub symbol: String,
    /// Metadata URI (max 200 chars).
    pub uri: String,
    /// Token decimals (e.g. 6 for USDC-style).
    pub decimals: u8,
    /// Whether the config PDA is set as permanent delegate on token accounts.
    pub enable_permanent_delegate: bool,
    /// Whether a transfer hook program is attached to the mint.
    pub enable_transfer_hook: bool,
    /// Whether new token accounts are frozen by default (requires explicit thaw).
    pub default_account_frozen: bool,
    pub _reserved: [u8; 32],
}

impl StablecoinConfig {
    /// Returns the current circulating supply (minted minus burned).
    pub fn current_supply(&self) -> u64 {
        self.total_minted.saturating_sub(self.total_burned)
    }

    /// Checks whether `amount` tokens can be minted without exceeding
    /// the supply cap or overflowing the total_minted counter.
    pub fn can_mint(&self, amount: u64) -> bool {
        let new_total = match self.total_minted.checked_add(amount) {
            Some(v) => v,
            None => return false,
        };

        match self.supply_cap {
            Some(cap) => {
                let new_supply = new_total.saturating_sub(self.total_burned);
                new_supply <= cap
            }
            None => true,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn default_config() -> StablecoinConfig {
        StablecoinConfig {
            authority: Pubkey::default(),
            mint: Pubkey::default(),
            preset: 1,
            paused: false,
            supply_cap: None,
            total_minted: 0,
            total_burned: 0,
            bump: 0,
            name: "Test Stablecoin".to_string(),
            symbol: "TST".to_string(),
            uri: "https://example.com/metadata.json".to_string(),
            decimals: 6,
            enable_permanent_delegate: true,
            enable_transfer_hook: false,
            default_account_frozen: false,
            _reserved: [0u8; 32],
        }
    }

    #[test]
    fn test_current_supply() {
        let mut cfg = default_config();
        assert_eq!(cfg.current_supply(), 0);

        cfg.total_minted = 1_000_000;
        cfg.total_burned = 400_000;
        assert_eq!(cfg.current_supply(), 600_000);

        // Saturating: burned > minted should not underflow
        cfg.total_burned = 2_000_000;
        assert_eq!(cfg.current_supply(), 0);
    }

    #[test]
    fn test_can_mint_no_cap() {
        let mut cfg = default_config();

        // No cap, any reasonable amount should succeed
        assert!(cfg.can_mint(1_000_000_000));
        assert!(cfg.can_mint(u64::MAX / 2));

        // Overflow: total_minted near u64::MAX
        cfg.total_minted = u64::MAX - 10;
        assert!(cfg.can_mint(10)); // exactly hits MAX
        assert!(!cfg.can_mint(11)); // overflows
    }

    #[test]
    fn test_can_mint_with_cap() {
        let mut cfg = default_config();
        cfg.supply_cap = Some(1_000_000);

        // Under cap
        assert!(cfg.can_mint(500_000));

        // Exactly at cap
        assert!(cfg.can_mint(1_000_000));

        // Over cap
        assert!(!cfg.can_mint(1_000_001));

        // After some burns, can mint more up to cap
        cfg.total_minted = 800_000;
        cfg.total_burned = 300_000;
        // Current supply = 500_000, cap = 1_000_000
        // Can mint up to 500_000 more
        assert!(cfg.can_mint(500_000));
        assert!(!cfg.can_mint(500_001));
    }

    #[test]
    fn test_can_mint_zero() {
        let mut cfg = default_config();
        assert!(cfg.can_mint(0));

        cfg.supply_cap = Some(100);
        cfg.total_minted = 100;
        // At cap, zero should still succeed
        assert!(cfg.can_mint(0));
    }
}
