use anchor_lang::prelude::*;

#[error_code]
pub enum SssError {
    #[msg("Protocol is paused")]
    Paused,
    #[msg("Not authorized for this operation")]
    Unauthorized,
    #[msg("Supply cap would be exceeded")]
    SupplyCapExceeded,
    #[msg("Minter quota exceeded for this epoch")]
    QuotaExceeded,
    #[msg("Address is blacklisted")]
    Blacklisted,
    #[msg("Feature not available for this preset")]
    FeatureNotEnabled,
    #[msg("Name too long")]
    NameTooLong,
    #[msg("Symbol too long")]
    SymbolTooLong,
    #[msg("Invalid amount")]
    InvalidAmount,
    #[msg("Arithmetic overflow")]
    Overflow,
    #[msg("Already paused")]
    AlreadyPaused,
    #[msg("Not paused")]
    NotPaused,
    #[msg("Not a minter")]
    NotMinter,
    #[msg("Not a freezer")]
    NotFreezer,
    #[msg("Not a blacklister")]
    NotBlacklister,
    #[msg("Not a pauser")]
    NotPauser,
    #[msg("Not an oracle")]
    NotOracle,
    #[msg("Banking rail not configured for this stablecoin")]
    BankingRailNotConfigured,
    #[msg("Invalid mint request status")]
    InvalidMintRequestStatus,
    #[msg("Invalid redemption status")]
    InvalidRedemptionStatus,
    #[msg("Attestation expired")]
    AttestationExpired,
    #[msg("Insufficient reserves")]
    InsufficientReserves,
    #[msg("No pending authority nomination")]
    NoPendingAuthority,
    #[msg("Amount underflow - cannot burn more than balance")]
    UnderflowProtection,
    #[msg("Oracle price is stale")]
    OraclePriceStale,
    #[msg("Oracle confidence interval too wide")]
    OracleConfidenceTooWide,
    #[msg("Price deviation exceeds maximum allowed")]
    PriceDeviationExceeded,
    #[msg("Role escalation not allowed")]
    RoleEscalation,
    #[msg("Account is not active")]
    AccountNotActive,
}
