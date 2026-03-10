# SSS-2: Compliant Stablecoin Preset

## Overview

SSS-2 is the compliance-focused stablecoin configuration for issuers who need per-transfer enforcement, blacklist management, token seizure, and KYC gating. It extends SSS-1 with additional Token-2022 extensions and a dedicated transfer hook program that enforces compliance rules on every token transfer.

## Token-2022 Extensions

| Extension | Purpose |
|---|---|
| MetadataPointer | Points token metadata to the mint account itself |
| TokenMetadata | On-chain name, symbol, and URI stored on the mint |
| MintCloseAuthority | Allows closing the mint account when supply reaches zero |
| PermanentDelegate | Enables token seizure (clawback) via the mint authority PDA |
| TransferHook | Enforces pause and blacklist checks on every transfer |
| DefaultAccountState | New token accounts start frozen (KYC gate) |

## Additional Capabilities (beyond SSS-1)

### Transfer Hook Enforcement

Every token transfer is intercepted by the `sss-hook` program, which:
1. Verifies the transfer is not paused
2. Checks the **source** wallet against the blacklist
3. Checks the **destination** wallet against the blacklist
4. Rejects the transfer if any check fails

This provides **bidirectional blacklisting** — both sending to and receiving from a blacklisted wallet are blocked, unlike plain freeze which only blocks the frozen account's outgoing transfers.

### Blacklist Management

The blacklister role can add or remove wallets from the on-chain blacklist:

- **Add to blacklist**: Creates a `BlacklistEntry` PDA storing the wallet, reason, timestamp, and who initiated it
- **Remove from blacklist**: Sets `blacklisted = false` on the entry (PDA is retained for audit trail)
- Blacklist entries are per-mint — a wallet blacklisted on one stablecoin is not affected on another

### Token Seizure (Clawback)

The authority can seize tokens from any account using the `PermanentDelegate` extension:

- Transfers tokens from the target account to a specified treasury account
- Does not require the target account holder's signature
- Emits a `TokensSeized` event with full audit details
- Only available on SSS-2 presets

### Default Frozen State (KYC Gate)

All new token accounts start in a frozen state:

- Users must be explicitly thawed before they can receive or send tokens
- This creates a natural KYC/compliance gate — only approved users can participate
- The authority or blacklister can thaw accounts after verification

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                    Token Transfer                     │
│                                                       │
│  User A ──transfer_checked──► Token-2022 Program     │
│                                     │                 │
│                                     ▼                 │
│                              ┌─────────────┐         │
│                              │  sss-hook    │         │
│                              │              │         │
│                              │ 1. Pause?    │         │
│                              │ 2. Src BL?   │         │
│                              │ 3. Dst BL?   │         │
│                              └──────┬───────┘         │
│                                     │                 │
│                              Pass ──► Transfer OK     │
│                              Fail ──► TX Reverted     │
└─────────────────────────────────────────────────────┘
```

## PDA Derivation

### Core Program PDAs

| Account | Seeds | Program |
|---|---|---|
| StablecoinConfig | `["config", mint]` | sss-core |
| Mint Authority | `["mint-authority", mint]` | sss-core |
| MinterState | `["minter", config, minter_wallet]` | sss-core |

### Hook Program PDAs

| Account | Seeds | Program |
|---|---|---|
| HookConfig | `["hook-config", mint]` | sss-hook |
| BlacklistEntry | `["blacklist", mint, wallet]` | sss-hook |
| ExtraAccountMetaList | `["extra-account-metas", mint]` | sss-hook |

## Account Schemas

### HookConfig

| Field | Type | Description |
|---|---|---|
| `mint` | Pubkey | The Token-2022 mint this hook serves |
| `stablecoin_config` | Pubkey | Core program's StablecoinConfig PDA |
| `core_program` | Pubkey | Core program ID for PDA validation |
| `bump` | u8 | PDA bump seed |

### BlacklistEntry

| Field | Type | Description |
|---|---|---|
| `mint` | Pubkey | Stablecoin mint this entry belongs to |
| `wallet` | Pubkey | The blacklisted wallet address |
| `blacklisted` | bool | Whether currently blacklisted |
| `reason` | String (max 64) | Human-readable reason |
| `blacklisted_at` | i64 | Unix timestamp |
| `blacklisted_by` | Pubkey | Who initiated the blacklisting |
| `bump` | u8 | PDA bump seed |

## ExtraAccountMeta Resolution

The transfer hook uses `ExtraAccountMetaList` to dynamically resolve accounts needed during transfer:

1. **HookConfig PDA** — static resolution from mint
2. **StablecoinConfig PDA** — for reading pause state (cross-program)
3. **Source BlacklistEntry PDA** — derived from source token account owner (dynamic, `account_index=0`, `data_index=32`)
4. **Destination BlacklistEntry PDA** — derived from destination token account owner (dynamic, `account_index=2`, `data_index=32`)

If a BlacklistEntry PDA doesn't exist (account data length 0 or system-owned), the wallet is treated as "not blacklisted."

## Initialization

SSS-2 requires a two-step initialization:

```typescript
import { StablecoinClient, ComplianceClient, PRESET_COMPLIANT } from "@sss/sdk";

// Step 1: Initialize the stablecoin with SSS-2 preset
const client = new StablecoinClient(connection, wallet);
const { mint, config } = await client.initialize({
  preset: PRESET_COMPLIANT,
  name: "Compliant USD",
  symbol: "CUSD",
  uri: "https://example.com/metadata.json",
  decimals: 6,
  hookProgramId: HOOK_PROGRAM_ID,
});

// Step 2: Initialize the transfer hook (creates ExtraAccountMetaList)
const compliance = new ComplianceClient(connection, wallet);
await compliance.initializeHook(mint);
```

## Compliance Operations

```typescript
// Add a wallet to the blacklist
await compliance.addToBlacklist(mint, suspectWallet, "AML violation");

// Check if a wallet is blacklisted
const isBlocked = await compliance.isBlacklisted(mint, suspectWallet);

// Remove from blacklist
await compliance.removeFromBlacklist(mint, suspectWallet);

// Seize tokens from a blacklisted account
await compliance.seize(mint, targetTokenAccount, treasuryTokenAccount, amount);
```

## SSS-1 vs SSS-2 Comparison

| Feature | SSS-1 | SSS-2 |
|---|---|---|
| Mint / burn | Yes | Yes |
| Freeze / thaw | Yes | Yes |
| Pause all operations | Yes | Yes |
| Role-based access control | Yes | Yes |
| Two-step authority transfer | Yes | Yes |
| On-chain metadata | Yes | Yes |
| Transfer hook enforcement | No | Yes |
| Blacklist (transfer block) | No | Yes |
| Token seizure (clawback) | No | Yes |
| Default frozen (KYC gate) | No | Yes |

## Security Considerations

- **Bidirectional blacklisting**: Unlike freeze (which only blocks the frozen account), the transfer hook blocks both sending from AND receiving to a blacklisted wallet
- **PermanentDelegate scope**: The delegate authority is the mint authority PDA, meaning seizure can only happen through the program's instruction logic — no external wallet can invoke it
- **Transfer hook integrity**: The hook verifies `TransferHookAccount.transferring` flag before processing, preventing direct invocation outside genuine transfers
- **Audit trail**: All blacklist and seizure operations emit events with full metadata (who, when, why)
- **Cross-program pause**: The hook reads the core program's config to check pause state, ensuring transfers are blocked when paused even though the hook is a separate program
