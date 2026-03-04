# API Reference

## TypeScript SDK API

### SolanaStablecoin Class

Main class for interacting with stablecoins.

#### Static Methods

##### `create(connection, params)`

Create a new stablecoin.

```typescript
const stable = await SolanaStablecoin.create(connection, {
  preset: Presets.SSS_2,
  name: "My Stablecoin",
  symbol: "MYUSD",
  decimals: 6,
  authority: authorityKeypair,
});
```

**Parameters:**
- `connection: Connection` - Solana RPC connection
- `params: CreateParams` - Configuration parameters

**Returns:** `Promise<SolanaStablecoin>`

##### `load(connection, mint)`

Load existing stablecoin.

```typescript
const stable = await SolanaStablecoin.load(connection, mintAddress);
```

**Parameters:**
- `connection: Connection` - Solana RPC connection
- `mint: PublicKey` - Mint address

**Returns:** `Promise<SolanaStablecoin>`

#### Instance Methods

##### `mint(params)`

Mint tokens to a recipient.

```typescript
await stable.mint({
  recipient: recipientAddress,
  amount: 1_000_000,
  minter: minterKeypair,
});
```

**Parameters:**
- `recipient: PublicKey` - Recipient address
- `amount: number` - Amount to mint (in base units)
- `minter: Keypair` - Minter keypair

**Returns:** `Promise<string>` - Transaction signature

##### `burn(params)`

Burn tokens.

```typescript
await stable.burn({
  amount: 1_000_000,
  burner: burnerKeypair,
});
```

**Parameters:**
- `amount: number` - Amount to burn
- `burner: Keypair` - Burner keypair

**Returns:** `Promise<string>` - Transaction signature

##### `freezeAccount(params)`

Freeze an account.

```typescript
await stable.freezeAccount({
  account: targetAddress,
  authority: authorityKeypair,
});
```

##### `thawAccount(params)`

Thaw a frozen account.

```typescript
await stable.thawAccount({
  account: targetAddress,
  authority: authorityKeypair,
});
```

##### `pause(pauser)`

Pause all operations.

```typescript
await stable.pause(pauserKeypair);
```

##### `unpause(pauser)`

Resume operations.

```typescript
await stable.unpause(pauserKeypair);
```

##### `getInfo()`

Get stablecoin information.

```typescript
const info = await stable.getInfo();
console.log(info.name, info.symbol, info.decimals);
```

**Returns:** `Promise<StablecoinInfo>`

##### `getTotalSupply()`

Get total supply.

```typescript
const supply = await stable.getTotalSupply();
```

**Returns:** `Promise<BN>`

##### `getBalance(address)`

Get balance of an address.

```typescript
const balance = await stable.getBalance(userAddress);
```

**Returns:** `Promise<BN>`

### ComplianceModule (SSS-2)

Compliance operations for SSS-2 stablecoins.

#### `blacklistAdd(address, reason, blacklister)`

Add address to blacklist.

```typescript
await stable.compliance.blacklistAdd(
  suspiciousAddress,
  "OFAC sanctions match",
  blacklisterKeypair
);
```

#### `blacklistRemove(address, blacklister)`

Remove address from blacklist.

```typescript
await stable.compliance.blacklistRemove(
  addressToUnblock,
  blacklisterKeypair
);
```

#### `seize(params)`

Seize tokens from frozen account.

```typescript
await stable.compliance.seize({
  from: frozenAccount,
  to: treasuryAddress,
  amount: 1_000_000,
  seizer: seizerKeypair,
});
```

#### `isBlacklisted(address)`

Check if address is blacklisted.

```typescript
const blocked = await stable.compliance.isBlacklisted(address);
```

**Returns:** `Promise<boolean>`

#### `listBlacklisted()`

List all blacklisted addresses.

```typescript
const blacklist = await stable.compliance.listBlacklisted();
```

**Returns:** `Promise<PublicKey[]>`

## CLI Commands

### init

Initialize a new stablecoin.

```bash
sss-token init --preset sss-2 \
  --name "My Stablecoin" \
  --symbol "MYUSD" \
  --decimals 6
```

### mint

Mint tokens.

```bash
sss-token mint <recipient> <amount>
```

### burn

Burn tokens.

```bash
sss-token burn <amount>
```

### freeze

Freeze an account.

```bash
sss-token freeze <address>
```

### thaw

Thaw a frozen account.

```bash
sss-token thaw <address>
```

### blacklist add

Add to blacklist (SSS-2).

```bash
sss-token blacklist add <address> --reason "Sanctions match"
```

### blacklist remove

Remove from blacklist (SSS-2).

```bash
sss-token blacklist remove <address>
```

### seize

Seize tokens (SSS-2).

```bash
sss-token seize <address> --to <treasury>
```

### status

Show stablecoin status.

```bash
sss-token status
```

### supply

Show total supply.

```bash
sss-token supply
```

## Types

### CreateParams

```typescript
interface CreateParams {
  preset?: PresetConfig;
  name: string;
  symbol: string;
  decimals: number;
  authority: Keypair;
  extensions?: ExtensionConfig;
  roles?: RolesConfig;
}
```

### StablecoinInfo

```typescript
interface StablecoinInfo {
  mint: PublicKey;
  name: string;
  symbol: string;
  decimals: number;
  authority: PublicKey;
  totalMinted: BN;
  totalBurned: BN;
  isPaused: boolean;
}
```

### Presets

```typescript
const Presets = {
  SSS_1: { /* Minimal config */ },
  SSS_2: { /* Compliant config */ },
  SSS_3: { /* Private config */ },
};
```

## Error Handling

```typescript
try {
  await stable.mint({ recipient, amount, minter });
} catch (error) {
  if (error.code === 6000) {
    console.error("Insufficient quota");
  } else if (error.code === 6001) {
    console.error("Operations paused");
  }
}
```

## Events

The SDK emits events that can be monitored:

```typescript
// Listen for mint events
connection.onLogs(mintAddress, (logs) => {
  if (logs.logs.includes("TokensMinted")) {
    console.log("Tokens minted!");
  }
});
```
