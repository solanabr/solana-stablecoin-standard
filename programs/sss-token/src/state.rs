use anchor_lang::prelude::*;

// =============================================================================
// ASSET BACKING TYPES
// =============================================================================

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug)]
pub enum BackingType {
    Fiat,           // USD, EUR, etc - traditional currency
    Gold,           // precious metals backing
    Crypto,         // crypto-collateralized (e.g., over-collateralized ETH/SOL)
    Commodity,      // oil, corn, silver, etc
    RealEstate,     // real estate backed
    MultiAsset,     // basket of mixed RWA
    Algorithmic,    // no direct backing, uses algo stability
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug)]
pub enum FiatCurrency {
    Usd,
    Eur,
    Gbp,
    Jpy,
    Chf,
    Cad,
    Aud,
    Cny,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug)]
pub enum CommodityType {
    Gold,
    Silver,
    Platinum,
    Oil,
    NaturalGas,
    Corn,
    Wheat,
    Coffee,
}

// =============================================================================
// BANKING RAILS
// =============================================================================

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug)]
pub enum BankingRail {
    Swift,      // international wire (SWIFT/BIC)
    Ach,        // US domestic (ACH)
    Sepa,       // EU domestic (SEPA)
    Fedwire,    // US high-value (Fedwire)
    Fps,        // UK Faster Payments
    Pix,        // Brazil instant payments
    Upi,        // India UPI
    None,       // no banking integration (crypto-only)
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug)]
pub enum MintRequestStatus {
    Pending,        // awaiting bank confirmation
    Confirmed,      // bank deposit verified
    Minted,         // tokens issued
    Rejected,       // deposit failed/returned
    Expired,        // request timed out
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug)]
pub enum RedemptionStatus {
    Requested,      // user burned tokens, withdrawal initiated
    Processing,     // wire transfer in progress
    Completed,      // funds delivered to bank
    Failed,         // transfer failed, tokens restored
}

// =============================================================================
// PRESETS
// =============================================================================

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug)]
pub enum Preset {
    Sss1,
    Sss2,
    Sss3,
}

#[account]
pub struct StablecoinConfig {
    pub authority: Pubkey,
    pub pending_authority: Option<Pubkey>,  // Two-step authority transfer
    pub mint: Pubkey,
    pub preset: Preset,
    pub name: String,
    pub symbol: String,
    pub decimals: u8,
    pub is_paused: bool,
    pub supply_cap: u64,
    pub total_minted: u64,
    pub total_burned: u64,
    // Asset backing configuration
    pub backing_type: BackingType,
    pub banking_rail: BankingRail,
    pub reserve_account: Option<Pubkey>,  // optional on-chain reserve tracking
    pub oracle: Option<Pubkey>,           // price/attestation oracle
    // Audit fields
    pub created_at: i64,
    pub last_updated: i64,
    // Reserved for future upgrades
    pub _reserved: [u8; 32],
    pub bump: u8,
}

impl StablecoinConfig {
    pub const MAX_NAME_LEN: usize = 32;
    pub const MAX_SYMBOL_LEN: usize = 10;

    pub const SPACE: usize = 8  // discriminator
        + 32  // authority
        + 1 + 32  // pending_authority (Option)
        + 32  // mint
        + 1   // preset enum
        + 4 + Self::MAX_NAME_LEN   // name (string)
        + 4 + Self::MAX_SYMBOL_LEN // symbol (string)
        + 1   // decimals
        + 1   // is_paused
        + 8   // supply_cap
        + 8   // total_minted
        + 8   // total_burned
        + 1   // backing_type
        + 1   // banking_rail
        + 1 + 32  // reserve_account (Option)
        + 1 + 32  // oracle (Option)
        + 8   // created_at
        + 8   // last_updated
        + 32  // _reserved
        + 1;  // bump

    pub fn current_supply(&self) -> u64 {
        self.total_minted.saturating_sub(self.total_burned)
    }

    pub fn is_sss2_or_higher(&self) -> bool {
        matches!(self.preset, Preset::Sss2 | Preset::Sss3)
    }
}

#[account]
pub struct RolesConfig {
    pub stablecoin: Pubkey,
    pub target: Pubkey,
    pub is_minter: bool,
    pub is_burner: bool,
    pub is_pauser: bool,
    pub is_freezer: bool,
    pub is_blacklister: bool,
    pub is_seizer: bool,
    pub mint_quota: u64,
    pub minted_this_epoch: u64,
    pub epoch_start: i64,
    // Audit fields
    pub granted_by: Pubkey,
    pub granted_at: i64,
    pub last_action_at: i64,
    pub active: bool,  // false = revoked (preserves audit trail)
    pub bump: u8,
}

impl RolesConfig {
    pub const SPACE: usize = 8  // discriminator
        + 32  // stablecoin
        + 32  // target
        + 1   // is_minter
        + 1   // is_burner
        + 1   // is_pauser
        + 1   // is_freezer
        + 1   // is_blacklister
        + 1   // is_seizer
        + 8   // mint_quota
        + 8   // minted_this_epoch
        + 8   // epoch_start
        + 32  // granted_by
        + 8   // granted_at
        + 8   // last_action_at
        + 1   // active
        + 1;  // bump

    pub const EPOCH_DURATION: i64 = 86400; // 24 hours

    pub fn check_and_update_quota(&mut self, amount: u64, now: i64) -> bool {
        if now - self.epoch_start >= Self::EPOCH_DURATION {
            self.minted_this_epoch = 0;
            self.epoch_start = now;
        }

        if self.mint_quota == 0 {
            return true; // no quota means unlimited
        }

        let after = self.minted_this_epoch.checked_add(amount);
        match after {
            Some(total) if total <= self.mint_quota => {
                self.minted_this_epoch = total;
                true
            }
            _ => false,
        }
    }
}

#[account]
pub struct BlacklistEntry {
    pub stablecoin: Pubkey,
    pub address: Pubkey,
    pub is_blacklisted: bool,  // false = removed (preserves audit trail)
    pub reason: [u8; 32],      // reason hash or short code
    pub blacklisted_by: Pubkey,
    pub blacklisted_at: i64,
    pub removed_by: Option<Pubkey>,
    pub removed_at: Option<i64>,
    pub bump: u8,
}

impl BlacklistEntry {
    pub const SPACE: usize = 8  // discriminator
        + 32  // stablecoin
        + 32  // address
        + 1   // is_blacklisted
        + 32  // reason
        + 32  // blacklisted_by
        + 8   // blacklisted_at
        + 1 + 32  // removed_by (Option)
        + 1 + 8   // removed_at (Option)
        + 1;  // bump
}

// =============================================================================
// BANKING RAILS ACCOUNTS
// =============================================================================

/// Tracks a fiat deposit -> stablecoin mint request
/// Flow: Bank deposit confirmed -> MintRequest created -> Tokens minted
#[account]
pub struct MintRequest {
    pub stablecoin: Pubkey,
    pub depositor: Pubkey,           // who deposited fiat
    pub recipient: Pubkey,           // who receives stablecoins
    pub amount: u64,                 // stablecoin amount to mint
    pub fiat_amount: u64,            // fiat amount deposited (in cents/smallest unit)
    pub fiat_currency: FiatCurrency,
    pub banking_rail: BankingRail,
    pub reference_id: [u8; 32],      // bank reference/wire ID
    pub status: MintRequestStatus,
    pub created_at: i64,
    pub confirmed_at: i64,
    pub bump: u8,
}

impl MintRequest {
    pub const SPACE: usize = 8 + 32 + 32 + 32 + 8 + 8 + 1 + 1 + 32 + 1 + 8 + 8 + 1;
}

/// Tracks a stablecoin burn -> fiat withdrawal request
/// Flow: Burn tokens -> RedemptionRequest created -> Wire transfer sent
#[account]
pub struct RedemptionRequest {
    pub stablecoin: Pubkey,
    pub redeemer: Pubkey,            // who burned tokens
    pub amount: u64,                 // stablecoin amount burned
    pub fiat_amount: u64,            // fiat amount to send
    pub fiat_currency: FiatCurrency,
    pub banking_rail: BankingRail,
    pub bank_account_hash: [u8; 32], // hash of bank details (privacy)
    pub status: RedemptionStatus,
    pub created_at: i64,
    pub completed_at: i64,
    pub wire_reference: [u8; 32],    // outgoing wire reference
    pub bump: u8,
}

impl RedemptionRequest {
    pub const SPACE: usize = 8 + 32 + 32 + 8 + 8 + 1 + 1 + 32 + 1 + 8 + 8 + 32 + 1;
}

/// On-chain reserve attestation for proof-of-reserves
#[account]
pub struct ReserveAttestation {
    pub stablecoin: Pubkey,
    pub attester: Pubkey,            // oracle or auditor pubkey
    pub total_reserves: u64,         // total backing assets value
    pub total_supply: u64,           // stablecoin supply at attestation time
    pub backing_ratio: u16,          // ratio in basis points (10000 = 100%)
    pub backing_type: BackingType,
    pub timestamp: i64,
    pub valid_until: i64,            // attestation expiry
    pub ipfs_hash: [u8; 32],         // detailed report on IPFS
    pub bump: u8,
}

impl ReserveAttestation {
    pub const SPACE: usize = 8 + 32 + 32 + 8 + 8 + 2 + 1 + 8 + 8 + 32 + 1;
}

// =============================================================================
// ORACLE CONFIGURATION (Pyth Price Feed Integration)
// =============================================================================

/// Oracle configuration for on-chain price validation
/// Validates that minting/burning only occurs when the stablecoin is on-peg
#[account]
pub struct OracleConfig {
    pub stablecoin: Pubkey,
    pub price_feed: Pubkey,          // Pyth price account address
    pub max_staleness_seconds: u64,  // reject if price is older than this
    pub max_deviation_bps: u16,      // reject if deviation > this (basis points)
    pub enabled: bool,               // toggle oracle validation
    pub target_price: i64,           // expected price (e.g., 100000000 = $1.00 with 8 decimals)
    pub last_validated_price: i64,   // last price that passed validation
    pub last_validated_at: i64,      // timestamp of last validation
    pub bump: u8,
}

impl OracleConfig {
    pub const SPACE: usize = 8    // discriminator
        + 32  // stablecoin
        + 32  // price_feed
        + 8   // max_staleness_seconds
        + 2   // max_deviation_bps
        + 1   // enabled
        + 8   // target_price
        + 8   // last_validated_price
        + 8   // last_validated_at
        + 1;  // bump
    
    /// Default: 60 seconds staleness, 2% deviation, $1.00 target
    pub fn default_for_usd() -> (u64, u16, i64) {
        (60, 200, 100_000_000) // 60s, 2%, $1.00 (8 decimals)
    }

    /// Validate price from Pyth feed data
    /// Returns Ok(price) if valid, Err if stale or depegged
    pub fn validate_price(&self, price: i64, conf: u64, timestamp: i64, now: i64) -> std::result::Result<i64, &'static str> {
        // Check staleness
        if now.saturating_sub(timestamp) > self.max_staleness_seconds as i64 {
            return Err("OracleStale");
        }

        // Check confidence interval (conf should be < 2% of price)
        let max_conf = (self.target_price.abs() as u64 * self.max_deviation_bps as u64) / 10000;
        if conf > max_conf {
            return Err("ConfidenceTooWide");
        }

        // Check deviation from peg
        let deviation = (price - self.target_price).abs();
        let max_deviation = (self.target_price.abs() * self.max_deviation_bps as i64) / 10000;
        if deviation > max_deviation {
            return Err("PriceDeviation");
        }

        Ok(price)
    }
}

// =============================================================================
// PARAMS
// =============================================================================

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct InitializeParams {
    pub name: String,
    pub symbol: String,
    pub decimals: u8,
    pub preset: Preset,
    pub supply_cap: u64,
    pub uri: String,
    pub hook_program_id: Option<Pubkey>,
    // NEW: backing and banking config
    pub backing_type: BackingType,
    pub banking_rail: BankingRail,
    pub oracle: Option<Pubkey>,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct MintFromBankParams {
    pub amount: u64,
    pub fiat_amount: u64,
    pub fiat_currency: FiatCurrency,
    pub reference_id: [u8; 32],
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct RedeemToBankParams {
    pub amount: u64,
    pub bank_account_hash: [u8; 32],
}
