use anchor_lang::prelude::*;

/// Main stablecoin state account
/// Stores configuration, roles, and operational state
#[account]
pub struct StablecoinState {
    /// Master authority (can update roles, transfer authority)
    pub master_authority: Pubkey,
    
    /// Mint address
    pub mint: Pubkey,
    
    /// Token metadata
    pub name: [u8; 32],
    pub symbol: [u8; 10],
    pub uri: [u8; 200],
    pub decimals: u8,
    
    /// Operational state
    pub is_paused: bool,
    pub total_minted: u64,
    pub total_burned: u64,
    
    /// SSS-2 Compliance flags
    pub compliance_enabled: bool,
    pub permanent_delegate_enabled: bool,
    pub transfer_hook_enabled: bool,
    pub default_account_frozen: bool,
    
    /// Bump seed for PDA
    pub bump: u8,
}

impl StablecoinState {
    /// Calculate space needed for account
    pub const LEN: usize = 8 + // discriminator
        32 + // master_authority
        32 + // mint
        32 + // name
        10 + // symbol
        200 + // uri
        1 + // decimals
        1 + // is_paused
        8 + // total_minted
        8 + // total_burned
        1 + // compliance_enabled
        1 + // permanent_delegate_enabled
        1 + // transfer_hook_enabled
        1 + // default_account_frozen
        1; // bump
}

/// Minter account with quota tracking
#[account]
pub struct MinterAccount {
    /// Minter public key
    pub minter: Pubkey,
    
    /// Daily minting quota
    pub daily_quota: u64,
    
    /// Amount minted today
    pub minted_today: u64,
    
    /// Last mint timestamp (for quota reset)
    pub last_mint_day: i64,
    
    /// Total minted by this minter
    pub total_minted: u64,
    
    /// Is active
    pub is_active: bool,
    
    /// Bump seed
    pub bump: u8,
}

impl MinterAccount {
    pub const LEN: usize = 8 + // discriminator
        32 + // minter
        8 + // daily_quota
        8 + // minted_today
        8 + // last_mint_day
        8 + // total_minted
        1 + // is_active
        1; // bump
    
    /// Check if minter can mint the requested amount
    pub fn can_mint(&self, amount: u64, current_day: i64) -> bool {
        if !self.is_active {
            return false;
        }
        
        // Reset quota if it's a new day
        if current_day > self.last_mint_day {
            return amount <= self.daily_quota;
        }
        
        // Check against remaining quota
        self.minted_today + amount <= self.daily_quota
    }
    
    /// Update minted amount
    pub fn record_mint(&mut self, amount: u64, current_day: i64) {
        // Reset if new day
        if current_day > self.last_mint_day {
            self.minted_today = 0;
            self.last_mint_day = current_day;
        }
        
        self.minted_today += amount;
        self.total_minted += amount;
    }
}

/// Role account for access control
#[account]
pub struct RoleAccount {
    /// Account with this role
    pub account: Pubkey,
    
    /// Role type
    pub role_type: u8, // 0: Burner, 1: Blacklister, 2: Pauser, 3: Seizer
    
    /// Is active
    pub is_active: bool,
    
    /// Bump seed
    pub bump: u8,
}

impl RoleAccount {
    pub const LEN: usize = 8 + // discriminator
        32 + // account
        1 + // role_type
        1 + // is_active
        1; // bump
}

/// Blacklist entry (SSS-2 only)
#[account]
pub struct BlacklistEntry {
    /// Blacklisted address
    pub address: Pubkey,
    
    /// Reason for blacklisting
    pub reason: [u8; 200],
    
    /// Timestamp when blacklisted
    pub blacklisted_at: i64,
    
    /// Blacklisted by (authority)
    pub blacklisted_by: Pubkey,
    
    /// Is active
    pub is_active: bool,
    
    /// Bump seed
    pub bump: u8,
}

impl BlacklistEntry {
    pub const LEN: usize = 8 + // discriminator
        32 + // address
        200 + // reason
        8 + // blacklisted_at
        32 + // blacklisted_by
        1 + // is_active
        1; // bump
}

/// Audit log entry for compliance tracking
#[account]
pub struct AuditLog {
    /// Action type (mint, burn, freeze, blacklist, seize, etc.)
    pub action: [u8; 32],
    
    /// Actor (who performed the action)
    pub actor: Pubkey,
    
    /// Target (who was affected)
    pub target: Pubkey,
    
    /// Amount (if applicable)
    pub amount: u64,
    
    /// Timestamp
    pub timestamp: i64,
    
    /// Additional data
    pub data: [u8; 200],
    
    /// Bump seed
    pub bump: u8,
}

impl AuditLog {
    pub const LEN: usize = 8 + // discriminator
        32 + // action
        32 + // actor
        32 + // target
        8 + // amount
        8 + // timestamp
        200 + // data
        1; // bump
}
