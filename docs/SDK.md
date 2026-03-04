# SDK Reference

Complete TypeScript SDK documentation for Solana Stablecoin Standard.

## Installation

```bash
npm install @stbr/sss-token
```

## Quick Start

```typescript
import { Connection, Keypair } from '@solana/web3.js';
import { SolanaStablecoin, Presets } from '@stbr/sss-token';
import BN from 'bn.js';

// Connect to Solana
const connection = new Connection('https://api.devnet.solana.com');
const authority = Keypair.fromSecretKey(/* your key */);

// Create stablecoin with preset
const stable = await SolanaStablecoin.create(connection, {
  preset: Presets.SSS_2,
  name: "My Stablecoin",
  symbol: "MYUSD",
  decimals: 6,
  authority,
});

// Mint tokens
await stable.mint({
  recipient: recipientAddress,
  amount: new BN(1_000_000),
  minter: minterKeypair,
});
```

## API Reference

### SolanaStablecoin Class

Main class for interacting with stablecoins.

#### Static Methods

##### `create(connection, params)`

Create a new stablecoin.

**Parameters:**
- `connection: Connection` - Solana connection
- `params: CreateStablecoinParams` - Configuration

**Returns:** `Promise<SolanaStablecoin>`

**Example:**
```typescript
const stable = await SolanaStablecoin.create(connection, {
  preset: Presets.SSS_1,
  name: "My Token",
  symbol: "MTK",
  decimals: 6,
  authority: adminKeypair,
  roles: {
    minters: [
      { address: minter1, dailyQuota: new BN(1_000_000) },
      { address: minter2, dailyQuota: new BN(500_000) },
    ],
    burners: [burner1],
    pausers: [pauser1],
  },
});
```

##### `load(connection, mint)`

Load an existing stablecoin.

**Parameters:**
- `connection: Connection` - Solana connection
- `mint: PublicKey` - Mint address

**Returns:** `Promise<SolanaStablecoin>`

**Example:**
```typescript
const stable = await SolanaStablecoin.load(
  connection,
  new PublicKey("mint_address_here")
);
```

#### Instance Methods

##### `mint(params)`

Mint tokens to a recipient.

**Parameters:**
```typescript
{
  recipient: PublicKey;
  amount: BN;
  minter: Keypair;
}
```

**Returns:** `Promise<string>` - Transaction signature

**Example:**
```typescript
const signature = await stable.mint({
  recipient: new PublicKey("recipient_address"),
  amount: new BN(1_000_000), // 1 token (6 decimals)
  minter: minterKeypair,
});
```

##### `burn(params)`

Burn tokens from an account.

**Parameters:**
```typescript
{
  amount: BN;
  burner: Keypair;
  tokenAccount: PublicKey;
}
```

**Returns:** `Promise<string>`

**Example:**
```typescript
await stable.burn({
  amount: new BN(500_000),
  burner: burnerKeypair,
  tokenAccount: tokenAccountAddress,
});
```

##### `freezeAccount(params)`

Freeze an account (prevent transfers).

**Parameters:**
```typescript
{
  tokenAccount: PublicKey;
  authority: Keypair;
}
```

**Returns:** `Promise<string>`

##### `thawAccount(params)`

Thaw a frozen account.

**Parameters:**
```typescript
{
  tokenAccount: PublicKey;
  authority: Keypair;
}
```

**Returns:** `Promise<string>`

##### `pause(pauser)`

Pause all operations.

**Parameters:**
- `pauser: Keypair` - Account with pauser role

**Returns:** `Promise<string>`

##### `unpause(pauser)`

Resume operations.

**Parameters:**
- `pauser: Keypair` - Account with pauser role

**Returns:** `Promise<string>`

##### `updateMinter(params)`

Add or remove a minter.

**Parameters:**
```typescript
{
  minter: PublicKey;
  dailyQuota: BN;
  action: 'add' | 'remove';
  authority: Keypair;
}
```

**Returns:** `Promise<string>`

**Example:**
```typescript
// Add minter
await stable.updateMinter({
  minter: newMinterAddress,
  dailyQuota: new BN(2_000_000),
  action: 'add',
  authority: masterAuthority,
});

// Remove minter
await stable.updateMinter({
  minter: oldMinterAddress,
  dailyQuota: new BN(0),
  action: 'remove',
  authority: masterAuthority,
});
```

##### `updateRole(params)`

Add or remove a role.

**Parameters:**
```typescript
{
  roleType: 'burner' | 'blacklister' | 'pauser' | 'seizer';
  account: PublicKey;
  action: 'add' | 'remove';
  authority: Keypair;
}
```

**Returns:** `Promise<string>`

##### `transferAuthority(newAuthority, currentAuthority)`

Transfer master authority.

**Parameters:**
- `newAuthority: PublicKey` - New master authority
- `currentAuthority: Keypair` - Current master authority

**Returns:** `Promise<string>`

##### `getInfo()`

Get stablecoin information.

**Returns:** `Promise<StablecoinInfo>`

**Example:**
```typescript
const info = await stable.getInfo();
console.log(`Name: ${info.name}`);
console.log(`Symbol: ${info.symbol}`);
console.log(`Total Supply: ${info.totalSupply.toString()}`);
```

##### `getTotalSupply()`

Get total supply.

**Returns:** `Promise<BN>`

##### `getBalance(address)`

Get balance of an address.

**Parameters:**
- `address: PublicKey` - Address to check

**Returns:** `Promise<BN>`

##### `getMinterInfo(minter)`

Get minter information.

**Parameters:**
- `minter: PublicKey` - Minter address

**Returns:** `Promise<MinterInfo>`

**Example:**
```typescript
const info = await stable.getMinterInfo(minterAddress);
console.log(`Daily Quota: ${info.dailyQuota.toString()}`);
console.log(`Minted Today: ${info.mintedToday.toString()}`);
console.log(`Remaining: ${info.remainingQuota.toString()}`);
```

### ComplianceModule (SSS-2)

Accessed via `stable.compliance`.

##### `blacklistAdd(address, reason, blacklister)`

Add address to blacklist.

**Parameters:**
- `address: PublicKey` - Address to blacklist
- `reason: string` - Reason (max 200 chars)
- `blacklister: Keypair` - Account with blacklister role

**Returns:** `Promise<string>`

**Example:**
```typescript
await stable.compliance.blacklistAdd(
  suspiciousAddress,
  "OFAC sanctions match",
  blacklisterKeypair
);
```

##### `blacklistRemove(address, blacklister)`

Remove address from blacklist.

**Parameters:**
- `address: PublicKey` - Address to remove
- `blacklister: Keypair` - Account with blacklister role

**Returns:** `Promise<string>`

##### `seize(params)`

Seize tokens from frozen account.

**Parameters:**
```typescript
{
  fromAccount: PublicKey;
  toAccount: PublicKey;
  amount: BN;
  seizer: Keypair;
}
```

**Returns:** `Promise<string>`

**Example:**
```typescript
await stable.compliance.seize({
  fromAccount: frozenAccount,
  toAccount: treasuryAccount,
  amount: new BN(1_000_000),
  seizer: seizerKeypair,
});
```

##### `isBlacklisted(address)`

Check if address is blacklisted.

**Parameters:**
- `address: PublicKey` - Address to check

**Returns:** `Promise<boolean>`

##### `listBlacklisted()`

List all blacklisted addresses.

**Returns:** `Promise<PublicKey[]>`

##### `getComplianceStats()`

Get compliance statistics.

**Returns:**
```typescript
Promise<{
  totalBlacklisted: number;
  totalSeized: BN;
  lastBlacklistUpdate: Date | null;
}>
```

## Presets

### Available Presets

```typescript
import { Presets } from '@stbr/sss-token';

Presets.SSS_1  // Minimal Stablecoin
Presets.SSS_2  // Compliant Stablecoin
Presets.SSS_3  // Private Stablecoin (experimental)
```

### Custom Configuration

```typescript
const stable = await SolanaStablecoin.create(connection, {
  name: "Custom Token",
  symbol: "CTK",
  decimals: 6,
  authority: adminKeypair,
  extensions: {
    permanentDelegate: true,
    transferHook: false,  // Custom: delegate without hook
    defaultAccountFrozen: false,
  },
});
```

## Types

### CreateStablecoinParams

```typescript
interface CreateStablecoinParams {
  preset?: Preset;
  name: string;
  symbol: string;
  decimals: number;
  uri?: string;
  authority: Keypair;
  extensions?: {
    permanentDelegate?: boolean;
    transferHook?: boolean;
    defaultAccountFrozen?: boolean;
  };
  roles?: {
    minters?: Array<{ address: PublicKey; dailyQuota: BN }>;
    burners?: PublicKey[];
    blacklisters?: PublicKey[];
    pausers?: PublicKey[];
    seizers?: PublicKey[];
  };
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
  totalMinted: BN;
  totalBurned: BN;
  isPaused: boolean;
  complianceEnabled: boolean;
  authority: PublicKey;
}
```

### MinterInfo

```typescript
interface MinterInfo {
  address: PublicKey;
  dailyQuota: BN;
  mintedToday: BN;
  remainingQuota: BN;
  totalMinted: BN;
  isActive: boolean;
}
```

## Error Handling

```typescript
try {
  await stable.mint({
    recipient: recipientAddress,
    amount: new BN(1_000_000),
    minter: minterKeypair,
  });
} catch (error) {
  if (error.message.includes('QuotaExceeded')) {
    console.error('Minter has exceeded daily quota');
  } else if (error.message.includes('Paused')) {
    console.error('Operations are paused');
  } else {
    console.error('Unknown error:', error);
  }
}
```

## Best Practices

### 1. Use BN for Amounts

```typescript
import BN from 'bn.js';

// ✅ Correct
const amount = new BN(1_000_000);

// ❌ Wrong
const amount = 1000000; // Will cause type errors
```

### 2. Handle Decimals

```typescript
// For 6 decimals (like USDC)
const oneToken = new BN(1_000_000);  // 1.000000
const halfToken = new BN(500_000);   // 0.500000

// Helper function
function toTokenAmount(humanAmount: number, decimals: number): BN {
  return new BN(humanAmount * Math.pow(10, decimals));
}

const amount = toTokenAmount(1.5, 6); // 1.5 tokens = 1,500,000
```

### 3. Check Quotas Before Minting

```typescript
const minterInfo = await stable.getMinterInfo(minterAddress);

if (minterInfo.remainingQuota.lt(amountToMint)) {
  console.error('Insufficient quota');
  return;
}

await stable.mint({
  recipient,
  amount: amountToMint,
  minter: minterKeypair,
});
```

### 4. Use Multi-sig for Master Authority

```typescript
import { Squads } from '@sqds/sdk';

// Create multi-sig wallet
const multisig = await Squads.create(/* config */);

// Use multi-sig as authority
const stable = await SolanaStablecoin.create(connection, {
  preset: Presets.SSS_2,
  name: "Secure Token",
  symbol: "SEC",
  decimals: 6,
  authority: multisig.authority,
});
```

### 5. Monitor Events

```typescript
// Subscribe to program logs
connection.onLogs(
  STABLECOIN_CORE_PROGRAM_ID,
  (logs) => {
    if (logs.logs.some(log => log.includes('TokensMinted'))) {
      console.log('Mint event detected');
      // Handle event
    }
  }
);
```

## Examples

See [examples/](../examples/) directory for complete examples:
- [basic-sss1/](../examples/basic-sss1/) - SSS-1 usage
- [compliant-sss2/](../examples/compliant-sss2/) - SSS-2 with compliance
