# @stbr/sss-sdk — TypeScript SDK Reference

The `@stbr/sss-sdk` package provides a TypeScript client for the Solana Stablecoin Standard. It exposes two layers:

- **`SolanaStablecoin`** — a high-level factory API with a fluent interface, recommended for most use cases
- **`SssClient`** — the low-level class that maps directly to on-chain instructions, useful for building custom tooling

---

## Installation

```bash
npm install @stbr/sss-sdk
# or
pnpm add @stbr/sss-sdk
# or
yarn add @stbr/sss-sdk
```

**Peer dependencies** (must be installed separately):
```bash
npm install @coral-xyz/anchor @solana/web3.js @solana/spl-token
```

**Versions tested:**
- `@coral-xyz/anchor` ^0.32.1
- `@solana/web3.js` ^1.98.0
- `@solana/spl-token` ^0.4.9

---

## Provider Setup

All SDK methods require an `AnchorProvider`. The provider must use a wallet that holds the relevant role for the operation being called.

```typescript
import { AnchorProvider, Wallet } from '@coral-xyz/anchor';
import { Connection, Keypair } from '@solana/web3.js';
import * as fs from 'fs';

function createProvider(rpcUrl: string, keypairPath: string): AnchorProvider {
  const secret = JSON.parse(fs.readFileSync(keypairPath, 'utf-8')) as number[];
  const keypair = Keypair.fromSecretKey(Uint8Array.from(secret));
  const connection = new Connection(rpcUrl, 'confirmed');
  return new AnchorProvider(connection, new Wallet(keypair), {
    commitment: 'confirmed',
  });
}

const provider = createProvider(
  'https://api.mainnet-beta.solana.com',
  '/path/to/authority-keypair.json',
);
```

---

## SolanaStablecoin

### `SolanaStablecoin.create()`

Creates a new stablecoin. This handles mint account creation, Token-2022 extension initialization, and SSS PDA setup in two transactions.

```typescript
static async create(
  provider: AnchorProvider,
  params: InitializeParams,
): Promise<SolanaStablecoin>
```

**Returns:** A `SolanaStablecoin` instance bound to the newly created mint.

```typescript
const token = await SolanaStablecoin.create(provider, {
  name: 'My Stablecoin',
  symbol: 'MYUSD',
  uri: 'https://example.com/metadata.json',
  decimals: 6,
  maxSupply: new BN('1000000000000000'),
  preset: StablecoinPreset.SSS2,
  minter: minterPublicKey,
  blacklister: compliancePublicKey,
  seizer: legalPublicKey,
});
```

### `SolanaStablecoin.load()`

Loads an existing stablecoin by mint address. Does not make any network requests; the connection happens lazily on the first method call.

```typescript
static load(provider: AnchorProvider, mint: PublicKey): SolanaStablecoin
```

```typescript
const token = SolanaStablecoin.load(provider, new PublicKey('<mint-address>'));
```

---

## Token Operations

### `token.mint(destination, amount)`

Mints tokens to a destination associated token account.

- Caller (provider wallet) must be `minter` or `master_authority`
- Fails if `paused = true` (returns `TransfersPaused`)
- Fails if quota would be exceeded (returns `MinterQuotaExceeded`)
- Fails if max supply would be exceeded (returns `MaxSupplyExceeded`)

```typescript
async mint(destination: PublicKey, amount: BN): Promise<string>
```

```typescript
// Mint 500 MYUSD (6 decimals → 500_000_000 base units)
const sig = await token.mint(recipientAta, new BN(500_000_000));
```

### `token.burn(source, amount)`

Burns tokens from a source token account. The source account must be owned by (or delegated to) the calling wallet.

- Caller must be `burner` or `master_authority`
- Fails if `paused = true`

```typescript
async burn(source: PublicKey, amount: BN): Promise<string>
```

```typescript
const sig = await token.burn(sourceAta, new BN(100_000_000));
```

### `token.freeze(tokenAccount)`

Freezes a Token-2022 token account. The account holder cannot send or receive until thawed.

- Caller must be `master_authority` or `pauser`

```typescript
async freeze(tokenAccount: PublicKey): Promise<string>
```

### `token.thaw(tokenAccount)`

Unfreezes a previously frozen token account.

- Caller must be `master_authority` or `pauser`

```typescript
async thaw(tokenAccount: PublicKey): Promise<string>
```

### `token.pause()`

Sets the global pause flag. Subsequent `mint` and `burn` calls fail with `TransfersPaused`.

- Caller must be `master_authority` or `pauser`

```typescript
async pause(): Promise<string>
```

### `token.unpause()`

Clears the global pause flag.

- Caller must be `master_authority` or `pauser`

```typescript
async unpause(): Promise<string>
```

---

## Compliance Methods (SSS-2 only)

All compliance methods are available under the `.compliance` namespace getter:

```typescript
token.compliance.blacklistAdd(target, reason?)
token.compliance.blacklistRemove(target)
token.compliance.isBlacklisted(address)
token.compliance.seize(source, destination, amount)
```

Calling these on an SSS-1 token returns error `Sss2NotEnabled` (6003).

### `token.compliance.blacklistAdd(target, reason?)`

Creates a `BlacklistEntry` PDA for the target wallet. After this call, the transfer hook will reject any token transfer to or from this address.

- Caller must be `blacklister` or `master_authority`

```typescript
blacklistAdd: (target: PublicKey, reason?: number) => Promise<string>
```

```typescript
// Reason 1 = OFAC sanctions (your own enumeration)
const sig = await token.compliance.blacklistAdd(walletPublicKey, 1);
```

### `token.compliance.blacklistRemove(target)`

Closes the `BlacklistEntry` PDA, re-enabling transfers for the address. Returns the PDA rent (~0.0016 SOL) to the calling wallet.

- Caller must be `blacklister` or `master_authority`

```typescript
blacklistRemove: (target: PublicKey) => Promise<string>
```

### `token.compliance.isBlacklisted(address)`

Checks whether a `BlacklistEntry` PDA exists for the given wallet address. Returns `false` if the account does not exist or on any fetch error.

```typescript
isBlacklisted: (address: PublicKey) => Promise<boolean>
```

```typescript
const blocked = await token.compliance.isBlacklisted(walletPublicKey);
if (blocked) {
  console.log('Address is sanctioned');
}
```

### `token.compliance.seize(source, destination, amount)`

Transfers tokens from the source token account to the destination token account using the `PermanentDelegate` extension, bypassing normal owner authorization.

- Caller must be `seizer` or `master_authority`
- Does not require the source account holder to sign

```typescript
seize: (source: PublicKey, destination: PublicKey, amount: BN) => Promise<string>
```

```typescript
const sig = await token.compliance.seize(
  targetAta,       // holder's ATA
  recoveryAta,     // your ATA
  new BN(5_000_000_000), // 5,000 MYUSD
);
```

---

## Administration Methods

### `token.updateRoles(params)`

Updates one or more role addresses. Only provided fields are changed; omitted fields retain their current values.

- Caller must be `master_authority`
- Updating `newMinterQuota` resets `minted_this_epoch` to zero
- Updating `newBlacklister` or `newSeizer` on an SSS-1 token returns `Sss2NotEnabled`

```typescript
async updateRoles(params: UpdateRolesParams): Promise<string>
```

```typescript
const sig = await token.updateRoles({
  newMinter: newMinterPublicKey,
  newMinterQuota: new BN(5_000_000_000_000),
  newPauser: newPauserPublicKey,
});
```

### `token.transferAuthority(newAuthority)`

Transfers `master_authority` to a new address. This is immediate and irreversible. The current authority loses all control after this call.

- Caller must be the current `master_authority`

```typescript
async transferAuthority(newAuthority: PublicKey): Promise<string>
```

```typescript
const sig = await token.transferAuthority(multisigPublicKey);
```

---

## Read Methods

### `token.getConfig()`

Fetches and returns the `StablecoinConfig` account data.

```typescript
async getConfig(): Promise<StablecoinConfig>
```

```typescript
const config = await token.getConfig();
console.log('Paused:', config.paused);
console.log('Max supply:', config.maxSupply.toString());
console.log('SSS-2 enabled:', config.permanentDelegateEnabled);
```

### `token.getRoles()`

Fetches and returns the `RolesConfig` account data.

```typescript
async getRoles(): Promise<RolesConfig>
```

```typescript
const roles = await token.getRoles();
console.log('Minter:', roles.minter.toBase58());
console.log('Quota:', roles.minterQuota.toString());
console.log('Minted this epoch:', roles.mintedThisEpoch.toString());
```

### `token.getTotalSupply()`

Returns the current total token supply as a `bigint`.

```typescript
async getTotalSupply(): Promise<bigint>
```

```typescript
const supply = await token.getTotalSupply();
console.log('Supply:', supply.toString()); // e.g., "100000000000000"
```

### `token.getOrCreateAta(owner)`

Returns the associated token account address for `owner`. If the account does not exist, it creates it in a transaction paid by the provider wallet.

```typescript
async getOrCreateAta(owner: PublicKey): Promise<PublicKey>
```

---

## PDA Utilities

These are pure functions — no RPC calls required.

### `findStablecoinConfigPda(mint, programId?)`

Derives the `StablecoinConfig` PDA address for a given mint.

```typescript
function findStablecoinConfigPda(
  mint: PublicKey,
  programId?: PublicKey,
): [PublicKey, number]
```

```typescript
import { findStablecoinConfigPda } from '@stbr/sss-sdk';
const [configPda, bump] = findStablecoinConfigPda(mintPublicKey);
```

### `findRolesConfigPda(mint, programId?)`

Derives the `RolesConfig` PDA address.

```typescript
function findRolesConfigPda(
  mint: PublicKey,
  programId?: PublicKey,
): [PublicKey, number]
```

### `findBlacklistEntryPda(mint, target, programId?)`

Derives the `BlacklistEntry` PDA for a specific wallet address. The returned PDA either exists (address is blacklisted) or is empty (not blacklisted).

```typescript
function findBlacklistEntryPda(
  mint: PublicKey,
  target: PublicKey,
  programId?: PublicKey,
): [PublicKey, number]
```

```typescript
import { findBlacklistEntryPda } from '@stbr/sss-sdk';
const [entryPda] = findBlacklistEntryPda(mintPublicKey, walletPublicKey);
// Check on-chain: if this account has data, the wallet is blacklisted
```

---

## TypeScript Types

### `StablecoinPreset` enum

```typescript
export enum StablecoinPreset {
  SSS1 = 0,   // Minimal stablecoin
  SSS2 = 1,   // Compliant stablecoin
  Custom = 2, // Custom configuration
}
```

### `InitializeParams`

```typescript
export interface InitializeParams {
  name: string;           // Max 32 characters
  symbol: string;         // Max 10 characters
  uri: string;            // Max 200 characters
  decimals?: number;      // 0–9, defaults to 6
  maxSupply?: BN;         // Base units, 0 = unlimited
  preset: StablecoinPreset;
  minter?: PublicKey;     // Defaults to authority
  minterQuota?: BN;       // Base units, 0 = unlimited
  burner?: PublicKey;     // Defaults to authority
  blacklister?: PublicKey; // SSS-2 only, defaults to authority
  pauser?: PublicKey;     // Defaults to authority
  seizer?: PublicKey;     // SSS-2 only, defaults to authority
}
```

### `StablecoinConfig`

```typescript
export interface StablecoinConfig {
  mint: PublicKey;
  preset: StablecoinPreset;
  paused: boolean;
  maxSupply: BN;
  decimals: number;
  permanentDelegateEnabled: boolean;
  transferHookEnabled: boolean;
  bump: number;
}
```

### `RolesConfig`

```typescript
export interface RolesConfig {
  mint: PublicKey;
  masterAuthority: PublicKey;
  minter: PublicKey;
  minterQuota: BN;
  mintedThisEpoch: BN;
  burner: PublicKey;
  blacklister: PublicKey;  // Pubkey::default() for SSS-1
  pauser: PublicKey;
  seizer: PublicKey;       // Pubkey::default() for SSS-1
  bump: number;
}
```

### `BlacklistEntry`

```typescript
export interface BlacklistEntry {
  mint: PublicKey;
  address: PublicKey;    // The blacklisted wallet
  addedAt: BN;           // Unix timestamp
  addedBy: PublicKey;    // Blacklister's wallet
  reason: number;        // User-defined reason code
  bump: number;
}
```

### `UpdateRolesParams`

```typescript
export interface UpdateRolesParams {
  newMinter?: PublicKey;
  newBurner?: PublicKey;
  newBlacklister?: PublicKey;  // SSS-2 only
  newPauser?: PublicKey;
  newSeizer?: PublicKey;       // SSS-2 only
  newMinterQuota?: BN;         // Also resets minted_this_epoch
}
```

### `InitializeResult`

```typescript
export interface InitializeResult {
  mint: PublicKey;
  stablecoinConfig: PublicKey;
  rolesConfig: PublicKey;
  signature: string;
}
```

---

## Constants

```typescript
import { SSS_PROGRAM_ID, TOKEN_2022_PROGRAM_ID, DEFAULT_DECIMALS } from '@stbr/sss-sdk';

SSS_PROGRAM_ID      // PublicKey: Aaw7RSm8fXXAfvDy9wS1FimFEmnHkzYtDmZCRgZg9pVm
TOKEN_2022_PROGRAM_ID // PublicKey: TokenzQdBNbLqP5VEhdkAS6EPGA1WymbbVQnDBtzdeyz
DEFAULT_DECIMALS    // 6
```

---

## Error Handling

All SDK methods are async and throw on failure. Anchor wraps program errors in a structured format:

```typescript
import { AnchorError } from '@coral-xyz/anchor';

try {
  await token.mint(destination, amount);
} catch (err) {
  if (err instanceof AnchorError) {
    console.error('Program error:', err.error.errorCode.code);
    // e.g., "Unauthorized", "TransfersPaused", "MinterQuotaExceeded"
    console.error('Message:', err.error.errorMessage);
    console.error('Logs:', err.logs);
  } else {
    console.error('Network or client error:', err);
  }
}
```

---

## Low-Level: SssClient

For direct instruction access without the factory pattern:

```typescript
import { SssClient } from '@stbr/sss-sdk';

const client = new SssClient(provider);

// All operations take explicit mint PublicKey as first argument
const result = await client.initialize({ name: 'X', symbol: 'X', uri: 'x', preset: StablecoinPreset.SSS1 });
await client.mint(result.mint, destinationAta, new BN(1_000_000));
await client.burn(result.mint, sourceAta, new BN(500_000));
await client.freeze(result.mint, tokenAccount);
await client.thaw(result.mint, tokenAccount);
await client.pause(result.mint);
await client.unpause(result.mint);
await client.addToBlacklist(result.mint, target, 0);
await client.removeFromBlacklist(result.mint, target);
await client.seize(result.mint, source, destination, amount);
await client.updateRoles(result.mint, { newMinter: pub });
await client.transferAuthority(result.mint, newAuthority);
const config = await client.getConfig(result.mint);
const roles = await client.getRoles(result.mint);
```
