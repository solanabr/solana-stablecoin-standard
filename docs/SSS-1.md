# SSS-1: Minimal Stablecoin Standard

## Overview

SSS-1 defines the minimal stablecoin configuration on Solana. It provides the essential capabilities every stablecoin needs — controlled minting, burning, and account freezing — without compliance extensions.

**Use cases:** Internal tokens, DAO treasuries, ecosystem settlement, wrapped assets, simple stablecoins where compliance is handled off-chain.

## Specification

### Token Properties

| Property | Value |
|----------|-------|
| Token Program | Token-2022 (SPL Token 2022) |
| Decimals | Configurable (default: 6) |
| Mint Authority | StablecoinConfig PDA |
| Freeze Authority | StablecoinConfig PDA |
| Extensions | None required |
| Metadata | On-chain (name, symbol, URI) |

### Required Capabilities

| Capability | Description |
|------------|-------------|
| **Initialize** | Create token mint and stablecoin config |
| **Mint** | Issue new tokens to any recipient |
| **Burn** | Destroy tokens from caller's account |
| **Freeze Account** | Freeze an individual token account |
| **Thaw Account** | Unfreeze a previously frozen account |
| **Pause** | Halt all mint/burn operations |
| **Unpause** | Resume operations |
| **Transfer Authority** | Hand over master authority |
| **Update Roles** | Grant/revoke roles to operators |
| **Update Minter** | Configure per-minter quotas |

### Access Control

| Role | Permissions |
|------|-------------|
| Master Authority | All role management, authority transfer |
| Minter | Mint tokens (up to configured quota) |
| Burner | Burn tokens from own account |
| Pauser | Pause/unpause operations |
| Freezer | Freeze/thaw token accounts |

### Compliance Approach

SSS-1 uses **reactive compliance**:
- Freeze suspicious accounts as needed
- Off-chain monitoring for sanctions screening
- No on-chain transfer restrictions beyond account freezing

This is suitable when:
- The issuer operates in a low-regulation environment
- Compliance is handled through off-chain systems
- Speed and simplicity are prioritized over on-chain enforcement

## On-Chain Accounts

### StablecoinConfig

```
Seeds: ["stablecoin", mint_pubkey]
Fields:
  authority: Pubkey
  mint: Pubkey
  name: String (max 32)
  symbol: String (max 10)
  uri: String (max 200)
  decimals: u8
  enable_permanent_delegate: false
  enable_transfer_hook: false
  paused: bool
  total_minted: u64
  total_burned: u64
```

### RoleAccount

```
Seeds: ["roles", stablecoin_config, holder]
Fields:
  roles: u16 (bitfield)
```

### MinterConfig

```
Seeds: ["minter", stablecoin_config, minter]
Fields:
  quota: u64 (0 = unlimited)
  minted: u64
  active: bool
```

## Example: Create SSS-1 Stablecoin

### CLI

```bash
sss-token init --preset sss-1 --name "Simple USD" --symbol "SUSD"
```

### TypeScript

```typescript
import { SolanaStablecoin, Presets } from "@stbr/sss-token";

const stable = await SolanaStablecoin.create(connection, {
  preset: Presets.SSS_1,
  name: "Simple USD",
  symbol: "SUSD",
  decimals: 6,
  authority: adminKeypair,
});
```

## Lifecycle

```
1. Initialize → Mint + Config + Roles created
2. Setup Minters → Configure who can mint and quotas
3. Operate → Mint/burn tokens as needed
4. Monitor → Track supply via getTotalSupply()
5. Respond → Freeze accounts if issues arise
```

## Upgrading to SSS-2

SSS-1 stablecoins **cannot** be upgraded to SSS-2 in-place because Token-2022 extensions must be set at mint creation time. To migrate:

1. Deploy a new SSS-2 stablecoin
2. Implement a migration contract or off-chain swap mechanism
3. Burn old tokens, mint new tokens 1:1
