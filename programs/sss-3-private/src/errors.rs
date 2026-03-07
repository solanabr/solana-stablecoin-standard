use anchor_lang::prelude::*;

#[error_code]
pub enum SSSPrivateError {
    /// 6000 — Caller is not the authority
    #[msg("Unauthorized: caller is not the authority")]
    Unauthorized,

    /// 6001 — Stablecoin is paused
    #[msg("Stablecoin is currently paused")]
    Paused,

    /// 6002 — Address is not on the allowlist
    #[msg("Address is not on the confidential transfer allowlist")]
    NotOnAllowlist,

    /// 6003 — Address is already on the allowlist
    #[msg("Address is already approved on the allowlist")]
    AlreadyOnAllowlist,

    /// 6004 — Allowlist entry has been revoked
    #[msg("Allowlist entry has been revoked")]
    AllowlistRevoked,

    /// 6005 — Invalid auditor key
    #[msg("Invalid auditor ElGamal public key")]
    InvalidAuditorKey,

    /// 6006 — Invalid proof data
    #[msg("Invalid zero-knowledge proof data")]
    InvalidProof,

    /// 6007 — Insufficient confidential balance
    #[msg("Insufficient confidential balance for withdrawal")]
    InsufficientConfidentialBalance,

    /// 6008 — Deposit amount must be greater than zero
    #[msg("Deposit amount must be greater than zero")]
    ZeroAmount,

    /// 6009 — KYC provider string too long
    #[msg("KYC provider string exceeds maximum length (32 chars)")]
    KycProviderTooLong,

    /// 6010 — Revocation reason too long
    #[msg("Revocation reason exceeds maximum length (128 chars)")]
    RevocationReasonTooLong,

    /// 6011 — Name too long
    #[msg("Token name exceeds maximum length (32 chars)")]
    NameTooLong,

    /// 6012 — Symbol too long
    #[msg("Token symbol exceeds maximum length (10 chars)")]
    SymbolTooLong,

    /// 6013 — URI too long
    #[msg("Token URI exceeds maximum length (200 chars)")]
    UriTooLong,

    /// 6014 — Confidential Transfer extension not available
    #[msg("Confidential Transfer extension is not yet available in this environment")]
    ConfidentialTransferUnavailable,
}
