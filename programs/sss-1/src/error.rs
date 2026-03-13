use anchor_lang::prelude::*;

#[error_code]
pub enum StablecoinError {
    #[msg("Unauthorized: caller does not have the required role")]
    Unauthorized,

    #[msg("Amount must be greater than zero")]
    ZeroAmount,

    #[msg("Arithmetic overflow")]
    MathOverflow,

    #[msg("Invalid role type")]
    InvalidRoleType,

    #[msg("Role already granted to this authority")]
    RoleAlreadyGranted,

    #[msg("Freeze functionality is not enabled for this stablecoin")]
    FreezeNotEnabled,

    #[msg("Roles are not enabled for this stablecoin")]
    RolesNotEnabled,

    #[msg("Name too long (max 32 bytes)")]
    NameTooLong,

    #[msg("Symbol too long (max 10 bytes)")]
    SymbolTooLong,

    #[msg("URI too long (max 200 bytes)")]
    UriTooLong,

    #[msg("Admin role cannot be granted via grant_role")]
    CannotGrantAdmin,

    #[msg("Admin role cannot be revoked via revoke_role")]
    CannotRevokeAdmin,

    #[msg("Stablecoin operations are paused")]
    Paused,

    #[msg("New authority cannot be the default pubkey")]
    InvalidNewAuthority,

    #[msg("New authority must be different from current authority")]
    AuthorityUnchanged,

    #[msg("Address is blacklisted and cannot participate in transfers")]
    Blacklisted,

    #[msg("Address is not on the blacklist")]
    NotBlacklisted,

    #[msg("Invalid blacklist account provided for transfer hook validation")]
    InvalidBlacklistAccount,

    #[msg("Invalid token account provided to transfer hook")]
    InvalidTokenAccount,

    #[msg("Token account owner must be the Token-2022 program")]
    InvalidTokenProgramOwner,

    #[msg("Token account mint does not match the hook mint")]
    InvalidTokenAccountMint,
}
