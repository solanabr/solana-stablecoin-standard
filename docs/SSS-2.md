# SSS-2: Compliant Stablecoin Standard

## Overview

SSS-2 extends SSS-1 with on-chain compliance enforcement. It adds a permanent delegate (for token seizure) and a transfer hook (for blacklist enforcement on every transfer).

**Use cases:** Regulated stablecoins (USDC/USDT-class), tokens subject to sanctions compliance (OFAC, EU sanctions), stablecoins under the GENIUS Act or similar legislation.

## Specification

### Token Properties

| Property | Value |
|----------|-------|
| Token Program | Token-2022 (SPL Token 2022) |
| Decimals | Configurable (default: 6) |
| Mint Authority | StablecoinConfig PDA |
| Freeze Authority | StablecoinConfig PDA |
| Permanent Delegate | StablecoinConfig PDA |
| Transfer Hook | sss_transfer_hook program |
| Metadata | On-chain (name, symbol, URI) |

### Token-2022 Extensions Used

| Extension | Purpose |
|-----------|---------|
| **Permanent Delegate** | Allows the stablecoin issuer to transfer tokens from any account (seizure) |
| **Transfer Hook** | Invokes the blacklist check program on every transfer |

### Additional Capabilities (beyond SSS-1)

| Capability | Description |
|------------|-------------|
| **Add to Blacklist** | Mark an address as blacklisted |
| **Remove from Blacklist** | Remove an address from blacklist |
| **Seize** | Transfer all tokens from a blacklisted account to treasury using permanent delegate |

### Additional Roles

| Role | Permissions |
|------|-------------|
| Blacklister | Add/remove addresses from blacklist |
| Seizer | Execute token seizure via permanent delegate |

## Transfer Hook Flow

Every Token-2022 transfer of an SSS-2 token triggers the transfer hook:

```
token_2022::transfer_checked
  → sss_transfer_hook::transfer_hook
    → Load StablecoinConfig
    → Check: Does sender have a BlacklistEntry PDA?
      → Yes: REJECT (SenderBlacklisted)
    → Check: Does recipient have a BlacklistEntry PDA?
      → Yes: REJECT (RecipientBlacklisted)
    → Both clean: ALLOW
```

The hook checks for **PDA existence** — if the blacklist PDA account exists and is owned by the program, the address is blacklisted. This is gas-efficient and doesn't require reading account data.

## Blacklist Architecture

### On-Chain Storage

```
BlacklistEntry PDA
  Seeds: ["blacklist", stablecoin_config, target_pubkey]
  Fields:
    stablecoin: Pubkey
    account: Pubkey
    reason: String (max 128 chars)
    added_by: Pubkey
    added_at: i64 (unix timestamp)
```

### Blacklist Lifecycle

1. **Screen** — Off-chain screening against OFAC/sanctions lists
2. **Add** — Create BlacklistEntry PDA on-chain
3. **Enforce** — Transfer hook automatically blocks transfers
4. **Freeze** — Optionally freeze the token account
5. **Seize** — Recover tokens to treasury via permanent delegate
6. **Remove** — Close BlacklistEntry PDA (reclaims rent)

### Why Permanent Delegate?

Without the permanent delegate, the issuer cannot recover tokens from a blacklisted account. The account holder could refuse to cooperate, leaving sanctioned funds frozen indefinitely.

With the permanent delegate:
- Tokens can be transferred **out** of any account by the delegate
- This enables seizure of sanctioned funds
- The delegate is the StablecoinConfig PDA (controlled by the program)
- Only accounts with the SEIZER role can invoke seizure

## Feature Gating

SSS-2 instructions check the stablecoin config before executing:

```rust
// Blacklist operations require transfer hook to be enabled
constraint = stablecoin_config.enable_transfer_hook @ SSSError::ComplianceNotEnabled

// Seize requires permanent delegate to be enabled
constraint = stablecoin_config.enable_permanent_delegate @ SSSError::PermanentDelegateNotEnabled
```

If an SSS-1 stablecoin tries to call SSS-2 instructions, they fail gracefully with descriptive errors.

## Regulatory Considerations

SSS-2 is designed to satisfy requirements of:

- **OFAC Sanctions** — Blacklist enforcement blocks transfers to/from sanctioned addresses
- **GENIUS Act** — On-chain compliance controls for stablecoin issuers
- **MiCA (EU)** — Token seizure capabilities for law enforcement cooperation

See [COMPLIANCE.md](COMPLIANCE.md) for detailed regulatory mapping.

## Example: Complete SSS-2 Workflow

```bash
# 1. Initialize SSS-2 stablecoin
sss-token init --preset sss-2 --name "Regulated USD" --symbol "RUSD"

# 2. Set up minters
sss-token minters add <MINTER> --quota 10000000000

# 3. Mint tokens
sss-token mint <RECIPIENT> 1000000000

# 4. Sanctions screening detects a match
sss-token blacklist add <SANCTIONED_ADDRESS> --reason "OFAC SDN List"

# 5. Transfers from/to this address are now blocked automatically

# 6. Freeze the account
sss-token freeze <TOKEN_ACCOUNT>

# 7. Seize tokens to treasury
sss-token seize <TOKEN_ACCOUNT> --to <TREASURY_ACCOUNT>

# 8. If cleared, remove from blacklist
sss-token blacklist remove <ADDRESS>
```
