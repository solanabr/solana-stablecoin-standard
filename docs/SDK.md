# TypeScript SDK (`@stbr/sss-sdk`)

## Installation

```bash
npm install @stbr/sss-sdk
```

## Quick Start

```typescript
import { SolanaStablecoin, Presets } from "@stbr/sss-sdk";
import * as anchor from "@coral-xyz/anchor";

const provider = anchor.AnchorProvider.env();
const program = anchor.workspace.Stablecoin;

// Create a new stablecoin
const { stablecoin, result } = await SolanaStablecoin.create(program, {
  preset: Presets.SSS_2,
  name: "MyUSD",
  symbol: "MUSD",
  uri: "https://example.com/metadata.json",
  decimals: 6,
  authority: ownerKeypair,
  masterMinter: masterMinterPubkey,
  pauser: pauserPubkey,
  blacklister: blacklisterPubkey,
});

// Load existing stablecoin
const existing = await SolanaStablecoin.load(program, mintPubkey);
```

## API Reference

### SolanaStablecoin

#### Static Methods

- `create(program, params)` - Create a new stablecoin
- `load(program, mint)` - Load an existing stablecoin

#### Instance Methods

- `mintTo({ recipient, amount, minter })` - Mint tokens
- `burnFrom({ amount, burner })` - Burn tokens
- `transfer({ from, to, amount })` - Transfer with automatic hook resolution
- `freeze(wallet, authority)` - Freeze a token account
- `thaw(wallet, authority)` - Thaw a frozen account
- `pause(pauser)` - Pause all transfers
- `unpause(pauser)` - Unpause transfers
- `addMinter(minter, allowance, masterMinter)` - Add a minter
- `removeMinter(minter, masterMinter)` - Remove a minter
- `updateMinterAllowance(minter, allowance, masterMinter)` - Update allowance
- `assignRole(role, assignee, authority)` - Assign a role
- `revokeRole(role, assignee, authority)` - Revoke a role
- `transferOwnership(newOwner, owner)` - Initiate ownership transfer
- `acceptOwnership(newOwner)` - Accept ownership
- `getConfig()` - Get stablecoin configuration
- `getTotalSupply()` - Get total supply

### Compliance API (`stablecoin.compliance`)

- `blacklistAdd(wallet, reason, blacklister)` - Add to blacklist
- `blacklistRemove(wallet, blacklister)` - Remove from blacklist
- `isBlacklisted(wallet)` - Check blacklist status
- `seize(targetWallet, treasuryOwner, amount, owner)` - Seize tokens

### PDA Helpers

```typescript
import {
  deriveConfigPda,
  deriveMintAuthorityPda,
  deriveMinterPda,
  deriveBlacklistPda,
  deriveRolePda,
  deriveExtraAccountMetaListPda,
} from "@stbr/sss-sdk";
```
