# S³-2: Compliant Preset

## Overview

S³-2 is the compliance-focused preset designed for regulated stablecoins. It adds transfer hooks for per-transfer compliance checks and permanent delegate for asset seizure.

## Extensions Enabled

- **MetadataPointer**: On-chain metadata
- **PermanentDelegate**: Enables token seizure from any account
- **TransferHook**: Per-transfer compliance checks via separate program

## Features (in addition to S³-1)

- **Blacklisting**: Per-address PDAs block transfers for sanctioned addresses
- **Seizure**: Owner can seize tokens from blacklisted accounts using permanent delegate
- **Transfer Hook**: Every `transfer_checked` call is validated against blacklist and pause status

## Blacklist Design

- Each blacklisted address gets a PDA: `["blacklist", mint, wallet]`
- PDA existence = blacklisted; closing PDA = unblacklisted
- Blacklisting also freezes the target's token account (belt + suspenders)
- Transfer hook checks both source and destination blacklist PDAs

## Seizure Flow

1. Blacklister blacklists the target address
2. Owner thaws the account (if frozen)
3. Owner calls `seize` which uses permanent delegate to transfer tokens
4. Transfer hook allows this because the authority is the program PDA (not a blacklisted user)

## Initialization

```typescript
const params = {
  preset: { sss2: {} },
  name: "ComplianceUSD",
  symbol: "CUSD",
  uri: "https://example.com/metadata.json",
  decimals: 6,
  masterMinter: masterMinterPubkey,
  pauser: pauserPubkey,
  blacklister: blacklisterPubkey,
};
```

## CLI

```bash
sss-token init --preset sss-2 --name "ComplianceUSD" --symbol "CUSD" --decimals 6 \
  --master-minter <pubkey> --pauser <pubkey> --blacklister <pubkey>

sss-token blacklist add <address> --reason "OFAC match" --mint <mint>
sss-token blacklist remove <address> --mint <mint>
```

## Transfer Hook Setup

After initializing the mint, the ExtraAccountMetaList must be initialized:

```typescript
await transferHookProgram.methods
  .initializeExtraAccountMetaList()
  .accounts({
    payer: authority.publicKey,
    extraAccountMetaList,
    mint: mintPubkey,
    systemProgram: SystemProgram.programId,
  })
  .rpc();
```
