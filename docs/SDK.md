# TypeScript SDK Reference

## Installation

```bash
npm install @solana-stablecoin-standard/sdk
```

## Quick Start

```typescript
import { Connection, Keypair } from "@solana/web3.js";
import { Wallet } from "@coral-xyz/anchor";
import { SssClient, Preset } from "@solana-stablecoin-standard/sdk";

const connection = new Connection("https://api.devnet.solana.com");
const wallet = new Wallet(keypair);
const client = new SssClient({ connection, wallet });

// Load the program IDL
await client.loadProgram(idl);

// Initialize an SSS-1 token
const { mint, signature } = await client.initialize({
  preset: Preset.SSS1,
  name: "My Stablecoin",
  symbol: "MYUSD",
  uri: "",
  decimals: 6,
  supplyCap: 0n,
});
```

## SssClient API

### Constructor

```typescript
new SssClient({
  connection: Connection;
  wallet: Wallet;
  tokenProgramId?: PublicKey;   // defaults to SSS_TOKEN_PROGRAM_ID
  hookProgramId?: PublicKey;    // defaults to SSS_HOOK_PROGRAM_ID
})
```

### Token Management

| Method | Description | Roles Required |
|--------|-------------|----------------|
| `initialize(params)` | Deploy a new SSS token | None (deployer becomes admin) |
| `mint(mint, destination, amount)` | Mint tokens | MINTER |
| `burn(mint, amount)` | Burn from own account | BURNER |
| `freeze(mint, targetOwner)` | Freeze a token account | FREEZER |
| `thaw(mint, targetOwner)` | Thaw a frozen account | FREEZER |
| `pause(mint)` | Pause all operations | ADMIN |
| `unpause(mint)` | Resume operations | ADMIN |

### Role Management

| Method | Description |
|--------|-------------|
| `grantRole(mint, target, role)` | Assign a role to an authority |
| `revokeRole(mint, target, role)` | Remove a role from an authority |
| `hasRole(mint, authority, role)` | Check if a wallet has a specific role |

### SSS-2 Compliance

| Method | Description | Roles Required |
|--------|-------------|----------------|
| `blacklistAdd(mint, address)` | Add to blacklist | BLACKLISTER |
| `blacklistRemove(mint, address)` | Remove from blacklist | BLACKLISTER |
| `isBlacklisted(mint, address)` | Check blacklist status | None |
| `seize(mint, sourceOwner, treasuryOwner)` | Seize from blacklisted account | SEIZER |

### Read Methods

| Method | Returns |
|--------|---------|
| `getConfig(mint)` | `TokenConfigAccount` |
| `getStatus(mint)` | `TokenStatus` (config + supply + blacklist count) |

## Event Listener

```typescript
import { SssEventListener } from "@solana-stablecoin-standard/sdk";

const listener = new SssEventListener(connection, programId);

listener
  .onMint((event) => console.log("Mint:", event))
  .onBurn((event) => console.log("Burn:", event))
  .onTransfer((event) => console.log("Transfer:", event));

listener.start();

// Later...
await listener.stop();
```

## PDA Utilities

```typescript
import {
  getConfigPDA,
  getRolePDA,
  getBlacklistPDA,
  getExtraAccountMetaListPDA,
} from "@solana-stablecoin-standard/sdk";

const [configPda, bump] = getConfigPDA(mintPubkey);
const [rolePda] = getRolePDA(configPda, authorityPubkey);
const [blacklistPda] = getBlacklistPDA(configPda);
const [metaListPda] = getExtraAccountMetaListPDA(mintPubkey);
```

## Types

```typescript
enum Preset { SSS1 = 1, SSS2 = 2 }

enum Role {
  Admin = 1,
  Minter = 2,
  Burner = 4,
  Freezer = 8,
  Blacklister = 16,
  Seizer = 32,
}
```
