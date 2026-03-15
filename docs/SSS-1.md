# SSS-1: Minimal Stablecoin Standard

## Overview

SSS-1 is the base stablecoin standard providing essential token management capabilities built on Solana Token-2022.

## Features

- **Token-2022 Mint** with mint authority held by a PDA
- **Freeze Authority** held by the config PDA for account-level freezing
- **On-chain Metadata** via the Token Metadata extension
- **Role-Based Access Control** with 4 role types
- **Global Pause Mechanism** for emergency stops
- **Supply Tracking** with on-chain accounting of minted and burned amounts

## Token-2022 Extensions Used

| Extension | Purpose |
|-----------|---------|
| MetadataPointer | Points to on-chain token metadata |
| Token Metadata | Stores name, symbol, URI on the mint account |

## Account Structure

### StablecoinConfig

The central configuration PDA stores all stablecoin parameters. Created during initialization with seeds `[b"stablecoin-config", mint_pubkey]`.

### RoleAssignment

Per-address role PDAs with seeds `[b"role", config_pubkey, holder_pubkey]`. Uses a bitmask for compact role storage:

- Bit 0: Minter
- Bit 1: Burner
- Bit 2: Pauser
- Bit 3: ComplianceOfficer (reserved, not functional in SSS-1)

## Instructions

| Instruction | Required Role | Description |
|-------------|---------------|-------------|
| `initialize` | Authority (signer) | Create mint with SSS-1 features |
| `mint_tokens` | Minter | Mint tokens to a destination ATA |
| `burn_tokens` | Burner | Burn tokens from a source ATA |
| `freeze_account` | Pauser / Master | Freeze a token account |
| `thaw_account` | Pauser / Master | Thaw a frozen token account |
| `pause` | Pauser / Master | Pause all operations globally |
| `unpause` | Master only | Unpause operations |
| `manage_role` | Master only | Grant or revoke roles |
| `transfer_authority` | Master only | Transfer master authority |

## Initialization Flow

1. Create Token-2022 mint account with space for MetadataPointer extension
2. Initialize MetadataPointer extension (pointing to mint itself)
3. Initialize the mint with authority = config PDA, freeze authority = config PDA
4. Initialize on-chain token metadata (name, symbol, URI)
5. Create StablecoinConfig PDA
6. Create RoleAssignment PDA for the initializing authority with all roles

## Security Considerations

- Mint authority is the config PDA — no single wallet can mint directly
- Freeze authority is the config PDA — requires program logic approval
- Only master authority can unpause (prevents a compromised pauser from toggling pause)
- Role assignments are individual PDAs — revocation doesn't require account resizing
- Minter quotas enforce per-address mint limits
