use anchor_lang::prelude::*;

#[error_code]
pub enum StablecoinError {
    #[msg("Operations are currently paused")]
    Paused,
    
    #[msg("Unauthorized: Missing required role")]
    Unauthorized,
    
    #[msg("Minter quota exceeded for today")]
    QuotaExceeded,
    
    #[msg("Minter is not active")]
    MinterInactive,
    
    #[msg("Invalid amount: Must be greater than zero")]
    InvalidAmount,
    
    #[msg("Compliance module not enabled for this stablecoin")]
    ComplianceNotEnabled,
    
    #[msg("Address is blacklisted")]
    AddressBlacklisted,
    
    #[msg("Address is not blacklisted")]
    AddressNotBlacklisted,
    
    #[msg("Permanent delegate not enabled (required for seizure)")]
    PermanentDelegateNotEnabled,
    
    #[msg("Transfer hook not enabled (required for blacklist enforcement)")]
    TransferHookNotEnabled,
    
    #[msg("Account must be frozen before seizure")]
    AccountNotFrozen,
    
    #[msg("Invalid configuration: Name too long (max 32 characters)")]
    NameTooLong,
    
    #[msg("Invalid configuration: Symbol too long (max 10 characters)")]
    SymbolTooLong,
    
    #[msg("Invalid configuration: URI too long (max 200 characters)")]
    UriTooLong,
    
    #[msg("Invalid configuration: Reason too long (max 200 characters)")]
    ReasonTooLong,
    
    #[msg("Arithmetic overflow")]
    Overflow,
    
    #[msg("Arithmetic underflow")]
    Underflow,
    
    #[msg("Role already exists")]
    RoleAlreadyExists,
    
    #[msg("Role does not exist")]
    RoleDoesNotExist,
    
    #[msg("Cannot remove last authority")]
    CannotRemoveLastAuthority,
    
    #[msg("Invalid role type")]
    InvalidRoleType,
    
    #[msg("Stablecoin already initialized")]
    AlreadyInitialized,
    
    #[msg("Invalid decimals: Must be between 0 and 9")]
    InvalidDecimals,
}
