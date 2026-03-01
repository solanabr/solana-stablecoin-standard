# SDK Reference

## Installation

```bash
npm install @stbr/sss-token
# or
yarn add @stbr/sss-token
```

## SolanaStablecoin

The main class for interacting with SSS stablecoins.

### Static Methods

#### `SolanaStablecoin.create(connection, wallet, config, idl?)`

Create and initialize a new stablecoin.

| Parameter | Type | Description |
|-----------|------|-------------|
| connection | Connection | Solana RPC connection |
| wallet | Wallet | Signer wallet |
| config | StablecoinConfig | Stablecoin configuration |
| idl | object | Optional IDL override |

Returns: `Promise<SolanaStablecoin>`

#### `SolanaStablecoin.load(connection, wallet, mint, idl?)`

Load an existing stablecoin by mint address.

| Parameter | Type | Description |
|-----------|------|-------------|
| connection | Connection | Solana RPC connection |
| wallet | Wallet | Signer wallet |
| mint | PublicKey | Mint address |
| idl | object | Optional IDL override |

Returns: `Promise<SolanaStablecoin>`

### Instance Methods

#### Token Operations

| Method | Parameters | Description |
|--------|-----------|-------------|
| `mint(recipient, amount)` | PublicKey, number\|BN | Mint tokens |
| `burn(tokenAccount, amount)` | PublicKey, number\|BN | Burn tokens |
| `freezeAccount(tokenAccount)` | PublicKey | Freeze account |
| `thawAccount(tokenAccount)` | PublicKey | Thaw account |
| `pause()` | — | Pause minting/burning |
| `unpause()` | — | Unpause |

#### Role Management

| Method | Parameters | Description |
|--------|-----------|-------------|
| `updateMinter(minter, quota?)` | PublicKey, number\|BN | Add/update minter |
| `removeMinter(minter)` | PublicKey | Remove minter |
| `updateRole(role, assignee, active)` | Role, PublicKey, boolean | Assign/revoke role |
| `transferAuthority(newAuthority)` | PublicKey | Transfer master authority |

#### Compliance (SSS-2)

| Method | Parameters | Description |
|--------|-----------|-------------|
| `addToBlacklist(target, reason)` | PublicKey, string | Blacklist address |
| `removeFromBlacklist(target)` | PublicKey | Remove from blacklist |
| `seize(from, treasury)` | PublicKey, PublicKey | Seize tokens |

#### Utilities

| Method | Parameters | Description |
|--------|-----------|-------------|
| `getState()` | — | Fetch on-chain state |
| `getTokenAddress(owner)` | PublicKey | Get ATA address |
| `createTokenAccountIx(owner)` | PublicKey | Create ATA instruction |

### Properties

| Property | Type | Description |
|----------|------|-------------|
| `mint` | PublicKey | Mint address |
| `stablecoinPda` | PublicKey | State PDA address |
| `config` | StablecoinConfig | Current configuration |

## Presets

```typescript
import { Presets } from "@stbr/sss-token";

Presets.SSS1({ name, symbol, decimals?, uri? })  // Minimal
Presets.SSS2({ name, symbol, decimals?, uri? })  // Compliant
Presets.Custom(fullConfig)                         // Custom
```

## PDA Helpers

```typescript
import { findStablecoinPda, findMinterPda, findRolePda, findBlacklistPda } from "@stbr/sss-token";

const [pda, bump] = findStablecoinPda(mintPubkey);
const [minterPda] = findMinterPda(stablecoinPda, minterPubkey);
const [rolePda] = findRolePda(stablecoinPda, Role.Burner, assigneePubkey);
const [blacklistPda] = findBlacklistPda(stablecoinPda, targetPubkey);
```

## Types

```typescript
enum Role { Burner, Pauser, Blacklister, Seizer }

interface StablecoinConfig {
  name: string;
  symbol: string;
  uri: string;
  decimals: number;
  enablePermanentDelegate: boolean;
  enableTransferHook: boolean;
  defaultAccountFrozen: boolean;
}
```
