# Architecture

## Overview

The Solana Stablecoin Standard (S³) is a two-program architecture built on Token-2022 (SPL Token Extensions).

## Programs

### Stablecoin Program (`SSSW3EixhrbB6yYpTdKmH2nCReqsA1VJqJkhwvcdzLA`)

The main program managing stablecoin lifecycle:

- **Initialize**: Creates Token-2022 mint with extensions based on preset
- **Mint/Burn**: Controlled by minters with per-minter allowances
- **Pause/Unpause**: Global emergency stop
- **Freeze/Thaw**: Individual account freezing
- **Blacklist**: Per-address PDAs (S³-2 only)
- **Seize**: Permanent delegate seizure (S³-2 only)
- **Roles**: PDA-based role management

### Transfer Hook Program (`Fi6N4Z2Xm47dRmLoDRcVAvoiQ1UnT2WcuzvwjXvcB8mu`)

Invoked by Token-2022 on every `transfer_checked`:

- Checks global pause status via Config PDA
- Checks source/destination blacklist PDAs
- Uses ExtraAccountMetaList for account resolution

## State Accounts (PDAs)

| Account | Seeds | Description |
|---------|-------|-------------|
| StablecoinConfig | `["config", mint]` | Global config per stablecoin |
| MinterAllowance | `["minter", mint, minter]` | Per-minter allowance tracking |
| BlacklistEntry | `["blacklist", mint, wallet]` | Blacklist entry (existence = blacklisted) |
| RoleAssignment | `["role", mint, role_bytes, assignee]` | Role tracking |
| MintAuthority | `["authority", mint]` | PDA used as mint/freeze authority |
| ExtraAccountMetaList | `["extra-account-metas", mint]` | Transfer hook extra accounts |

## Token-2022 Extensions

| Extension | S³-1 | S³-2 | S³-3 |
|-----------|-------|-------|-------|
| MetadataPointer | Yes | Yes | Yes |
| PermanentDelegate | No | Yes | Yes |
| TransferHook | No | Yes | No |
| ConfidentialTransferMint | No | No | Yes |
| DefaultAccountState | Optional | Optional | Optional |

## Authority Model

The PDA `["authority", mint]` serves as:
- Mint authority (minting new tokens)
- Freeze authority (freezing/thawing accounts)
- Permanent delegate (seizing tokens)
- Metadata update authority

This PDA is owned by the stablecoin program, ensuring all privileged operations go through program logic with proper access control.

## Two-Step Ownership

Ownership transfer requires:
1. Current owner calls `transfer_ownership(new_owner)`
2. New owner calls `accept_ownership()`

This prevents accidental loss of ownership.

## Transfer Hook Flow

```
User calls transfer_checked
    -> Token-2022 processes transfer
    -> Token-2022 reads TransferHook extension
    -> Token-2022 resolves ExtraAccountMetaList
    -> Token-2022 CPIs to Transfer Hook Program
        -> Hook checks Config.is_paused
        -> Hook checks source BlacklistEntry
        -> Hook checks dest BlacklistEntry
        -> Returns OK or Error
```
