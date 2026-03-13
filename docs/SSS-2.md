# SSS-2: Compliant Stablecoin Standard

> **Status**: Stable  
> **Program**: `sss_token`  
> **Extensions**: SSS-1 + Permanent Delegate + Transfer Hook + Blacklist PDAs

## Overview

SSS-2 extends [SSS-1](./SSS-1.md) with compliance capabilities for regulated stablecoins. It enables on-chain blacklist enforcement and token seizure — the features regulators expect from USDC/USDT-class tokens.

**Use cases**: Regulated stablecoins, fiat-backed tokens, institutional tokens requiring sanctions compliance.

## What SSS-2 Adds

| Capability | How It Works |
|-----------|-------------|
| **Blacklisting** | Per-address PDAs. If the PDA exists, the address is blocked. |
| **Token Seizure** | Permanent delegate authority allows the program to transfer from any account. |
| **Transfer Hook** | Every transfer checks the blacklist PDA — blocked addresses can't send or receive. |
| **Default Frozen** | New token accounts start frozen; must be explicitly thawed. |

## Initialization

SSS-2 is initialized by passing the right feature flags:

```typescript
const stable = await SolanaStablecoin.create(connection, wallet, {
  preset: Presets.SSS_2,  // or manually:
  // extensions: {
  //   permanentDelegate: true,
  //   transferHook: true,
  //   defaultAccountFrozen: true,
  // },
  name: "Regulated USD",
  symbol: "rUSD",
  decimals: 6,
});
```

## Blacklist

### On-Chain State

Each blacklisted address gets its own PDA:

Seeds: `["blacklist", config_pubkey, address_pubkey]`

```rust
pub struct BlacklistEntry {
    pub config: Pubkey,         // Parent stablecoin config
    pub address: Pubkey,        // The blacklisted address
    pub reason: String,         // Human-readable reason (max 128 chars)
    pub blacklisted_at: i64,    // Unix timestamp
    pub blacklisted_by: Pubkey, // Who blacklisted them
    pub bump: u8,
}
```

### `add_to_blacklist`

```
add_to_blacklist(reason: String)
  Accounts: blacklister (signer), config, role_manager, blacklist_entry (init), 
            address_to_blacklist, system_program
  Checks: signer is blacklister or master_authority, config.enable_permanent_delegate == true
  Effects: creates blacklist PDA, emits AddressBlacklisted event
```

### `remove_from_blacklist`

```
remove_from_blacklist()
  Accounts: blacklister (signer), config, role_manager, blacklist_entry (close)
  Effects: closes PDA, reclaims rent, emits AddressUnblacklisted event
```

## Token Seizure

The seize instruction transfers all tokens from a frozen, blacklisted account to a treasury. It uses the **permanent delegate** authority granted to the config PDA.

### Flow

```
1. blacklist add <address>     — creates blacklist PDA
2. freeze <address>            — freezes the token account
3. seize <address> --to <treasury>  — transfers tokens to treasury
```

### On-Chain Implementation

The seize handler performs a 3-step atomic operation:

```
1. Thaw the frozen account (so transfer can execute)
2. Transfer all tokens → treasury (via permanent delegate CPI)
3. Re-freeze the account (account remains frozen after seizure)
```

### `seize`

```
seize()
  Accounts: seizer (signer), config, role_manager, blacklist_entry,
            mint, from_token_account, treasury_token_account, token_program
  Checks: signer is seizer or master_authority, blacklist_entry exists,
          from_token_account is frozen, config.enable_permanent_delegate == true
  Effects: thaw → transfer_checked → re-freeze, emits TokensSeized event
```

## Feature Gating

SSS-2 instructions fail gracefully when called on an SSS-1 token:

```
Error: ComplianceNotEnabled
  "This operation requires SSS-2 compliance features (permanent delegate + transfer hook)"
```

The program checks `config.enable_permanent_delegate` before executing any compliance instruction.

## Events

SSS-2 adds these events to the [SSS-1 events](./SSS-1.md#events):

- `AddressBlacklisted { mint, address, reason, blacklisted_by }`
- `AddressUnblacklisted { mint, address }`
- `TokensSeized { mint, from, treasury, amount }`

## SDK Usage

```typescript
// Blacklist
await stable.compliance.blacklistAdd(suspectAddress, "OFAC match");
await stable.compliance.blacklistRemove(clearedAddress);

// Check status
const isBlocked = await stable.compliance.isBlacklisted(address);
const entry = await stable.compliance.getBlacklistEntry(address);

// Full seizure flow
await stable.compliance.blacklistAdd(suspect, "Sanctions");
await stable.freeze({ address: suspect });
await stable.compliance.seize(suspect, treasuryWallet);
```

## CLI Usage

```bash
sss-token blacklist add <address> --reason "OFAC match" --mint <mint>
sss-token blacklist remove <address> --mint <mint>
sss-token seize <address> --to <treasury> --mint <mint>
```

## Regulatory Considerations

See [COMPLIANCE.md](./COMPLIANCE.md) for regulatory guidance, audit trail format, and sanctions screening integration points.
