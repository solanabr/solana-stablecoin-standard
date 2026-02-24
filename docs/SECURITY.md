# Security

This document describes the SSS threat model, access control architecture, and security considerations.

## Role-Based Access Control Matrix

| Operation | Admin | Minter | Freezer | Pauser | No Role |
|---|---|---|---|---|---|
| Initialize stablecoin | -- | -- | -- | -- | Creator |
| Mint tokens | -- | ✅ | -- | -- | -- |
| Burn tokens | -- | ✅ | -- | -- | -- |
| Freeze account | -- | -- | ✅ | -- | -- |
| Thaw account | -- | -- | ✅ | -- | -- |
| Pause | -- | -- | -- | ✅ | -- |
| Unpause | -- | -- | -- | ✅ | -- |
| Seize tokens | ✅ | -- | -- | -- | -- |
| Grant role | ✅ | -- | -- | -- | -- |
| Revoke role | ✅ | -- | -- | -- | -- |
| Update supply cap | ✅ | -- | -- | -- | -- |
| Add to blacklist | ✅ | -- | -- | -- | -- |
| Remove from blacklist | ✅ | -- | -- | -- | -- |
| Transfer tokens | -- | -- | -- | -- | Token owner |
| Check info/status | -- | -- | -- | -- | Anyone |

## PDA Authority Model

The `StablecoinConfig` PDA is the single source of authority for all Token-2022 operations. It is set as:

- **Mint authority** -- Only the config PDA can mint new tokens
- **Freeze authority** -- Only the config PDA can freeze/thaw accounts
- **Permanent delegate** -- The config PDA can transfer or burn from any token account
- **Metadata update authority** -- The config PDA can update token metadata
- **ConfidentialTransferMint authority** (SSS-3) -- The config PDA controls confidential transfer settings
- **TransferHook authority** (SSS-2) -- The config PDA controls the transfer hook program reference

No private key exists for the config PDA. It can only sign via the `sss-core` program using PDA signer seeds:

```
["sss-config", mint_pubkey, bump]
```

This means all authority operations must go through the `sss-core` program's instruction handlers, which enforce role-based access checks before signing.

## Authorization Flow

```
Caller        sss-core                 Token-2022
  |               |                        |
  | instruction   |                        |
  |-------------->|                        |
  |               |                        |
  |               | Verify role PDA exists |
  |               | at expected address    |
  |               |                        |
  |               | Check pause status     |
  |               |                        |
  |               | Sign as config PDA     |
  |               |----------------------->|
  |               |                        |
  |               |    Execute operation   |
  |               |<-----------------------|
  |               |                        |
```

Role verification uses Anchor's account constraint system: the role PDA must exist at the address derived from `["sss-role", config, caller, role_u8]`. If the PDA does not exist (has no data, or is not owned by the program), the instruction fails with `AccountNotFound`.

## Cross-Program Verification

The `sss-transfer-hook` program verifies admin authorization without depending on `sss-core` at the CPI level. Instead, it:

1. Takes the purported admin role account as input
2. Verifies the account is **owned by** the sss-core program ID
3. Re-derives the expected config PDA from the mint: `["sss-config", mint]` via `sss-core`
4. Re-derives the expected admin role PDA: `["sss-role", config, authority, 0]` via `sss-core`
5. Checks the provided account matches the expected PDA address

This approach avoids CPI and its associated compute costs while maintaining security through PDA derivation verification.

## Attack Vectors Considered

### Cross-Mint Spoofing

**Threat:** An attacker creates a stablecoin on a different mint and attempts to use their admin role to manage blacklists for another stablecoin.

**Mitigation:** Blacklist PDAs are seeded with the mint public key: `["blacklist", mint, address]`. Admin verification re-derives the config PDA from the specific mint being operated on. An admin role for mint A cannot authorize blacklist operations on mint B because the PDA derivation produces different addresses.

### Self-Revocation Lockout

**Threat:** A sole admin revokes their own admin role, permanently locking out all administrative operations.

**Mitigation:** The `revoke_role` instruction checks if the admin is revoking their own admin role and returns `LastAdmin` error. To transfer admin: grant the new admin first, then the new admin revokes the old one.

### Pause Bypass

**Threat:** A minter or freezer attempts operations while the stablecoin is paused.

**Mitigation:** The `config.paused` flag is checked as an Anchor constraint on every pausable instruction. Constraints are evaluated before the handler executes, so there is no window for bypass.

**Exception:** Seize is intentionally exempt from pause checks. This is a design decision: seizure is an emergency measure that must function even during a pause (e.g., recovering stolen funds during an incident).

### Blacklist Entry Recycling

**Threat:** After removing a blacklist entry, the attacker re-creates it with different data.

**Mitigation:** Only admins can create or remove blacklist entries. The blacklist PDA is derived from `["blacklist", mint, address]`, so there can only be one entry per address per mint. Recreation requires admin authorization and creates a new entry from scratch.

### Role PDA Forgery

**Threat:** An attacker creates a fake account at the expected role PDA address.

**Mitigation:** Role PDAs are created by the `sss-core` program via `init` constraints. The PDA must be owned by the sss-core program, which Anchor verifies automatically. An externally created account at the same address would have a different owner and fail validation.

### Supply Cap Bypass via Burn+Mint

**Threat:** An attacker burns tokens and re-mints to effectively bypass the supply cap.

**Mitigation:** The supply cap is checked against `current_supply` (total_minted - total_burned), not against total_minted alone. After burning, the cap allows minting back up to the cap. This is by design: the cap limits circulating supply, not cumulative minting.

### ExtraAccountMetas Manipulation

**Threat:** An attacker modifies the ExtraAccountMetaList PDA to skip blacklist checks.

**Mitigation:** The ExtraAccountMetaList PDA is derived from `["extra-account-metas", mint]` and is owned by the transfer hook program. It can only be initialized once (creating it at an already-initialized address fails). The transfer hook program does not expose an update instruction for this PDA.

### Arithmetic Overflow

**Threat:** Minting an extremely large amount causes `total_minted` to overflow, wrapping around and bypassing the supply cap.

**Mitigation:** All arithmetic uses `checked_add` and returns `ArithmeticOverflow` on overflow. The `can_mint` function also uses `checked_add` before comparing against the cap.

## Token-2022 Extension Security

### PermanentDelegate

The permanent delegate gives the config PDA the ability to transfer or burn from ANY token account for this mint. This is a powerful capability used for:

- **Seizure** -- Forcibly transferring tokens from compromised accounts
- **Burning** -- Burning tokens from any account (not just the caller's)

Security properties:
- The permanent delegate is set at mint creation and cannot be changed
- Only the `sss-core` program can sign as the config PDA
- Seizure requires admin role verification

### DefaultAccountState (SSS-2)

New token accounts start frozen, preventing transfers until thawed by a freezer. This creates a KYC gate but also means:

- Airdrops to unfrozen accounts work normally
- Airdrops to frozen accounts succeed (tokens are received) but the holder cannot transfer out until thawed
- The account must be thawed before the holder can interact

### TransferHook (SSS-2)

Every transfer invokes the hook program. Security properties:

- The hook program ID is set at mint creation and cannot be changed via normal means
- The TransferHook authority (config PDA) could theoretically update the hook program, but no instruction exposes this capability
- The hook validates via PDA existence, not via data inspection, eliminating data parsing vulnerabilities

### ConfidentialTransferMint (SSS-3)

Security properties:

- The auditor ElGamal key is set at mint creation
- The ConfidentialTransferMint authority (config PDA) can update the auditor key
- ZK proofs are verified on-chain by Token-2022 -- the program does not need to implement cryptographic verification
- The `auto_approve_new_accounts` flag controls whether new accounts can immediately use confidential transfers or require approval

## Emergency Procedures

### Incident Response Priority

1. **Pause** -- Immediately pause the stablecoin to stop all operations
2. **Blacklist** -- (SSS-2) Blacklist compromised addresses
3. **Seize** -- Move at-risk tokens to a safe treasury account
4. **Investigate** -- Analyze on-chain events and transaction history
5. **Remediate** -- Return seized funds, remove blacklist entries as appropriate
6. **Resume** -- Unpause operations

### Key Recovery

If an admin keypair is compromised:

1. Use a backup admin wallet to revoke the compromised admin's role
2. Grant admin role to a new, secure wallet
3. Rotate all operational roles (minter, freezer, pauser) as a precaution
4. If the compromised admin took unauthorized actions, use seize and blacklist to remediate

### Program Upgrade

The program upgrade authority can deploy new program code. Ensure:

- The upgrade authority keypair is stored securely (hardware wallet recommended)
- Test upgrades on devnet/localnet before mainnet
- Verify the new code does not alter PDA derivation (would break existing accounts)
- Consider setting the upgrade authority to a multisig for mainnet deployments

## Backend Security

### API Key Management

- Generate strong, random API keys (minimum 32 characters)
- Rotate API keys periodically
- Use different keys for different environments (dev, staging, production)
- Never log API keys

### Keypair Security

- The backend keypair file (`KEYPAIR_PATH`) should have restricted file permissions (600)
- Use a dedicated wallet for the backend -- do not share with other services
- Grant only the minimum roles needed for backend operations
- Monitor the backend wallet balance and role assignments

### Rate Limiting

Default: 30 requests per 60 seconds per IP. Configurable in the `createRateLimiter` middleware.

### Transport Security

- Use HTTPS in production (TLS termination via reverse proxy)
- Set appropriate CORS headers
- Helmet middleware is enabled by default for common security headers
