# SSS Token SDK Documentation

## Overview

The `@stbr/sss-token` SDK provides TypeScript bindings for interacting with Solana Stablecoin Standards (SSS) programs.

## Installation

```bash
npm install @stbr/sss-token
# or
yarn add @stbr/sss-token
```

## Quick Start

```typescript
import { Connection, Keypair } from '@solana/web3.js';
import { SolanaStablecoin, Presets, SSS2Hook } from '@stbr/sss-token';
import { BN } from '@coral-xyz/anchor';

const connection = new Connection('https://api.devnet.solana.com', 'confirmed');
const payer = Keypair.generate(); // Your wallet

// Create SSS-2 stablecoin
const stable = await SolanaStablecoin.create(connection, {
  preset: Presets.SSS_2,
  name: 'My USD',
  symbol: 'mUSD',
  decimals: 6,
  mintAuthority: payer.publicKey,
  hookConfig: {
    transferFeeBasisPoints: 100, // 1%
    maxTransferFee: new BN(1000000000), // 1 SOL
  },
});

if (stable.success) {
  console.log('Stablecoin created:', stable.data);
}
```

## Core Classes

### SolanaStablecoin

Main factory class for creating and managing stablecoins.

#### Factory Methods

##### `create()`

```typescript
static async create(
  connection: Connection,
  options: CreateStablecoinOptions
): Promise<SDKResult<SolanaStablecoin>>
```

**Parameters:**
- `connection`: Solana connection object
- `options`: Stablecoin configuration

**Options:**
```typescript
interface CreateStablecoinOptions {
  preset: Presets;                    // SSS_1, SSS_2, or SSS_3
  name: string;                       // Token name
  symbol: string;                     // Token symbol
  decimals: number;                   // Decimals (default: 6)
  mintAuthority: PublicKey;           // Mint authority
  freezeAuthority?: PublicKey;        // Optional freeze authority
  hookConfig?: SSS2HookConfig;       // Required for SSS-2
}
```

**Example:**
```typescript
const result = await SolanaStablecoin.create(connection, {
  preset: Presets.SSS_2,
  name: 'Test USD',
  symbol: 'TUSD',
  decimals: 6,
  mintAuthority: wallet.publicKey,
  hookConfig: {
    transferFeeBasisPoints: 100,
    maxTransferFee: new BN(1000000000),
    minTransferAmount: new BN(1000),
    blacklistEnabled: true,
  },
});
```

#### Instance Methods

##### `getSSS2Hook()`

```typescript
getSSS2Hook(): SSS2Hook | undefined
```

Get the SSS-2 hook instance (only for SSS-2 presets).

##### `getSSS1()`

```typescript
getSSS1(): SSS1Stablecoin | undefined
```

Get the SSS-1 instance (only for SSS-1 presets).

### SSS2Hook

Class for managing SSS-2 transfer hook operations.

#### Constructor

```typescript
constructor(
  connection: Connection,
  payer: Keypair,
  programId?: PublicKey // Defaults to devnet program
)
```

#### Methods

##### `initialize()`

Initialize the transfer hook with fee configuration.

```typescript
async initialize(config: SSS2HookConfig): Promise<SDKResult>
```

**Config:**
```typescript
interface SSS2HookConfig {
  transferFeeBasisPoints: number;  // Fee rate (100 = 1%)
  maxTransferFee: BN;              // Maximum fee in lamports
  minTransferAmount?: BN;            // Minimum transfer amount
  blacklistEnabled?: boolean;        // Enable blacklist
}
```

**Example:**
```typescript
const result = await hook.initialize({
  transferFeeBasisPoints: 100,  // 1%
  maxTransferFee: new BN(1000000000), // 1 SOL
});

if (result.success) {
  console.log('Config PDA:', result.data.configPda);
}
```

##### `updateFeeConfig()`

Update fee configuration (admin only).

```typescript
async updateFeeConfig(config: {
  transferFeeBasisPoints: number;
  maxTransferFee: BN;
  minTransferAmount: BN;
}): Promise<SDKResult>
```

**Example:**
```typescript
await hook.updateFeeConfig({
  transferFeeBasisPoints: 200,  // 2%
  maxTransferFee: new BN(2000000000), // 2 SOL
  minTransferAmount: new BN(500),
});
```

##### `addWhitelist()` / `removeWhitelist()`

Manage whitelist entries.

```typescript
async addWhitelist(address: PublicKey): Promise<SDKResult>
async removeWhitelist(address: PublicKey): Promise<SDKResult>
```

**Example:**
```typescript
const address = new PublicKey('...');

// Add
await hook.addWhitelist(address);

// Remove
await hook.removeWhitelist(address);
```

##### `addBlacklist()` / `removeBlacklist()`

Manage blacklist entries.

```typescript
async addBlacklist(address: PublicKey): Promise<SDKResult>
async removeBlacklist(address: PublicKey): Promise<SDKResult>
```

**Example:**
```typescript
const badActor = new PublicKey('...');

// Add to blacklist
await hook.addBlacklist(badActor);

// Remove from blacklist
await hook.removeBlacklist(badActor);
```

##### `setPermanentDelegate()`

Set or clear permanent delegate.

```typescript
async setPermanentDelegate(delegate?: PublicKey): Promise<SDKResult>
```

**Example:**
```typescript
// Set
await hook.setPermanentDelegate(treasuryPublicKey);

// Clear
await hook.setPermanentDelegate(undefined);
```

##### `setBlacklistEnabled()`

Toggle blacklist enforcement.

```typescript
async setBlacklistEnabled(enabled: boolean): Promise<SDKResult>
```

##### `setPaused()`

Emergency pause/unpause.

```typescript
async setPaused(paused: boolean): Promise<SDKResult>
```

**Example:**
```typescript
// Emergency pause
await hook.setPaused(true);

// Resume
await hook.setPaused(false);
```

##### `calculateFee()`

Calculate fee for a transfer amount.

```typescript
calculateFee(amount: BN, config: SSS2HookConfig): FeeCalculation
```

**Returns:**
```typescript
interface FeeCalculation {
  amount: BN;       // Original amount
  fee: BN;          // Calculated fee
  netAmount: BN;    // Amount after fee
  rateBps: number;   // Fee rate used
}
```

**Example:**
```typescript
const calc = hook.calculateFee(
  new BN(1000000000), // 1 token
  { transferFeeBasisPoints: 100, maxTransferFee: new BN(1000000000) }
);

console.log(`Fee: ${calc.fee}`);
console.log(`Net: ${calc.netAmount}`);
```

##### PDA Helpers

```typescript
getConfigPDA(): PublicKey
getWhitelistPDA(address: PublicKey): PublicKey
getBlacklistPDA(address: PublicKey): PublicKey
```

**Example:**
```typescript
const configPDA = hook.getConfigPDA();
const whitelistPDA = hook.getWhitelistPDA(someAddress);
const blacklistPDA = hook.getBlacklistPDA(anotherAddress);
```

### SSS1Stablecoin

Basic stablecoin with RBAC.

#### Methods

##### `create()`

Create a new stablecoin.

```typescript
async create(options: {
  name: string;
  symbol: string;
  decimals: number;
}): Promise<SDKResult>
```

##### `mint()`

Mint tokens.

```typescript
async mint(options: {
  recipient: PublicKey;
  amount: BN;
}): Promise<SDKResult>
```

**Example:**
```typescript
await sss1.mint({
  recipient: recipientPublicKey,
  amount: new BN(1000000), // 1 token
});
```

##### `burn()`

Burn tokens.

```typescript
async burn(options: {
  amount: BN;
}): Promise<SDKResult>
```

##### `freeze()` / `thaw()`

Freeze/unfreeze accounts.

```typescript
async freeze(options: { account: PublicKey }): Promise<SDKResult>
async thaw(options: { account: PublicKey }): Promise<SDKResult>
```

## Types

### Presets

```typescript
enum Presets {
  SSS_1 = 'sss-1',
  SSS_2 = 'sss-2',
  SSS_3 = 'sss-3',
}
```

### SDKResult

```typescript
interface SDKResult<T = TransactionSignature> {
  success: boolean;
  signature?: T;
  error?: string;
  data?: any;
}
```

### StablecoinInfo

```typescript
interface StablecoinInfo {
  mint: PublicKey;
  name: string;
  symbol: string;
  decimals: number;
  totalSupply: BN;
  isFrozen: boolean;
  hookProgramId?: PublicKey;
  hookConfig?: any;
}
```

## Error Handling

```typescript
try {
  const result = await hook.initialize(config);
  
  if (!result.success) {
    console.error('Failed:', result.error);
    return;
  }
  
  console.log('Success:', result.signature);
} catch (error) {
  console.error('Unexpected error:', error);
}
```

## Constants

### Program IDs

```typescript
// Devnet
const SSS2_PROGRAM_ID = new PublicKey(
  'FSkkSmrThcLpU9Uybrn4xcpbQKswUJn7KvoUQBsLPExD'
);
```

## Advanced Usage

### Custom Connection

```typescript
import { Connection, clusterApiUrl } from '@solana/web3.js';

// Devnet
const devnet = new Connection(clusterApiUrl('devnet'), 'confirmed');

// Mainnet
const mainnet = new Connection(clusterApiUrl('mainnet-beta'), 'confirmed');

// Custom RPC
const custom = new Connection('https://your-rpc-url.com', 'confirmed');
```

### Wallet Integration

```typescript
import { WalletAdapterNetwork } from '@solana/wallet-adapter-base';

// Using wallet adapter
const wallet = useWallet();

const hook = new SSS2Hook(connection, {
  // Wallet adapter compatible
} as Keypair);
```

### Batch Operations

```typescript
const addresses = [addr1, addr2, addr3];

// Batch whitelist
await Promise.all(
  addresses.map(addr => hook.addWhitelist(addr))
);
```

## Examples

### Complete SSS-2 Setup

```typescript
import { Connection, Keypair } from '@solana/web3.js';
import { SSS2Hook } from '@stbr/sss-token';
import { BN } from '@coral-xyz/anchor';

async function setup() {
  const connection = new Connection(
    'https://api.devnet.solana.com',
    'confirmed'
  );
  const payer = loadKeypair();
  
  const hook = new SSS2Hook(connection, payer);
  
  // Initialize
  await hook.initialize({
    transferFeeBasisPoints: 100,
    maxTransferFee: new BN(1000000000),
  });
  
  // Add compliance
  await hook.addWhitelist(kycVerifiedAddress);
  await hook.addBlacklist(sanctionedAddress1);
  await hook.addBlacklist(sanctionedAddress2);
  
  console.log('Setup complete');
  console.log('Config PDA:', hook.getConfigPDA().toString());
}

setup().catch(console.error);
```

### Fee Calculator

```typescript
function displayFee(hook: SSS2Hook, amount: number) {
  const calc = hook.calculateFee(
    new BN(amount),
    { transferFeeBasisPoints: 100, maxTransferFee: new BN(1000000000) }
  );
  
  console.table({
    'Amount': amount / 1e6,
    'Fee': calc.fee.toNumber() / 1e6,
    'Net': calc.netAmount.toNumber() / 1e6,
    'Rate': `${calc.rateBps / 100}%`,
  });
}
```

## References

- [Architecture Overview](./ARCHITECTURE.md)
- [SSS-1 Specification](./SSS-1.md)
- [SSS-2 Specification](./SSS-2.md)
- [Operations Guide](./OPERATIONS.md)
- [API Reference](./API.md)
