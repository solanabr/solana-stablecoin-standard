use anchor_lang::prelude::*;

#[error_code]
pub enum StablecoinError {
    #[msg("Program is paused")]
    Paused,
    #[msg("SSS-2 compliance module not enabled for this token")]
    ComplianceNotEnabled,
    #[msg("Account is blacklisted")]
    BlacklistedAccount,
    #[msg("Unauthorized: missing required role")]
    Unauthorized,
    #[msg("Mint quota exceeded for this minter")]
    QuotaExceeded,
    #[msg("Name too long")]
    NameTooLong,
    #[msg("Symbol too long")]
    SymbolTooLong,
    #[msg("URI too long")]
    UriTooLong,
    #[msg("Standard version too long")]
    StandardVersionTooLong,
    #[msg("Reason too long")]
    ReasonTooLong,
    #[msg("Invalid decimals")]
    InvalidDecimals,
    #[msg("Arithmetic overflow")]
    Overflow,
    #[msg("Transfer hook program required for SSS-2")]
    TransferHookRequired,
    #[msg("Pending authority did not match signer")]
    InvalidPendingAuthority,
    #[msg("Invalid mint account for config")]
    InvalidMint,
    #[msg("Amount must be greater than zero")]
    InvalidAmount,
    #[msg("Compressed compliance root too long")]
    CompressedComplianceRootTooLong,
    #[msg("Compliance circuit identifier too long")]
    ComplianceCircuitTooLong,
    #[msg("Proof nullifier too long")]
    ProofNullifierTooLong,
    #[msg("Proof commitment too long")]
    ProofCommitmentTooLong,
    #[msg("SSS-3 proof receipts are not enabled for this token")]
    ZkComplianceNotEnabled,
    #[msg("Compressed compliance state is not enabled for this token")]
    CompressedComplianceStateNotEnabled,
    #[msg("A transfer hook is required for SSS-3 enforcement")]
    ZkProofTransferHookRequired,
    #[msg("Confidential transfers are required for SSS-3 enforcement")]
    ConfidentialTransfersRequired,
    #[msg("Invalid proof verifier program for SSS-3 enforcement")]
    InvalidProofVerifierProgram,
    #[msg("Invalid proof receipt")]
    InvalidProofReceipt,
    #[msg("Proof receipt has expired")]
    ProofReceiptExpired,
}
