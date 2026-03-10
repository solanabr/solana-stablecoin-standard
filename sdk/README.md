# solana-stablecoin-standard

TypeScript SDK for the Solana Stablecoin Standard (SSS). Provides a high-level client for interacting with both the `sss-token` and `sss-transfer-hook` programs, PDA derivation helpers, event parsing, oracle integration, and preset configuration utilities.

## Installation

```bash
npm install solana-stablecoin-standard
```

**Peer dependencies**: `@solana/web3.js` (^1.95), `@coral-xyz/anchor` (^0.31.1), `@solana/spl-token` (^0.4), `bn.js` (^5.2).

## Quick Start

```typescript
import { Connection, Keypair } from "@solana/web3.js";
import { Wallet, BN } from "@coral-xyz/anchor";
import { SSSClient, StablecoinPreset, getPresetAnchorEnum } from "solana-stablecoin-standard";

// Connect
const connection = new Connection("http://localhost:8899", "confirmed");
const wallet = new Wallet(Keypair.generate());
const client = new SSSClient(connection, wallet);

// Initialize an SSS-2 compliant stablecoin
const mintKeypair = Keypair.generate();
const { signature } = await client.initialize(
  {
    name: "USD Coin",
    symbol: "USDC",
    uri: "https://example.com/metadata.json",
    decimals: 6,
    preset: getPresetAnchorEnum(StablecoinPreset.SSS2),
  },
  mintKeypair,
  client.hookProgramId // pass hook program for SSS-2
);
console.log("Initialized:", signature);

// Configure a minter
await client.updateMinter(
  mintKeypair.publicKey,
  wallet.publicKey,
  { isActive: true, mintQuota: new BN(1_000_000_000) }
);

// Mint tokens
const recipientATA = client.getAssociatedTokenAddress(
  mintKeypair.publicKey,
  wallet.publicKey
);
await client.mintTokens(mintKeypair.publicKey, new BN(500_000_000), recipientATA);

// Fetch config
const config = await client.fetchConfig(mintKeypair.publicKey);
console.log("Total minted:", config.totalMinted.toString());
```

## API Reference

### Constructor

```typescript
new SSSClient(connection: Connection, wallet: Wallet, options?: SSSClientOptions)
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `tokenProgramId` | `PublicKey` | `SSS_TOKEN_PROGRAM_ID` | Override the sss-token program ID |
| `hookProgramId` | `PublicKey` | `SSS_TRANSFER_HOOK_PROGRAM_ID` | Override the sss-transfer-hook program ID |

### PDA Helpers

All PDA helpers are available both as instance methods on `SSSClient` and as standalone functions.

| Method | Parameters | Returns | Description |
|--------|-----------|---------|-------------|
| `getConfigPda` | `mint: PublicKey` | `[PublicKey, number]` | Derive the StablecoinConfig PDA for a mint |
| `getRoleRegistryPda` | `config: PublicKey` | `[PublicKey, number]` | Derive the RoleRegistry PDA |
| `getMinterInfoPda` | `config: PublicKey, minter: PublicKey` | `[PublicKey, number]` | Derive the MinterInfo PDA for a specific minter wallet |
| `getBlacklistPda` | `config: PublicKey, address: PublicKey` | `[PublicKey, number]` | Derive the BlacklistEntry PDA for a specific address |
| `getReserveAttestationPda` | `config: PublicKey, index: BN \| number` | `[PublicKey, number]` | Derive the ReserveAttestation PDA by index |
| `getExtraAccountMetaListPda` | `mint: PublicKey` | `[PublicKey, number]` | Derive the ExtraAccountMetaList PDA (hook program) |

### Account Fetchers

| Method | Parameters | Returns | Description |
|--------|-----------|---------|-------------|
| `fetchConfig` | `mint: PublicKey` | `Promise<StablecoinConfig>` | Fetch the StablecoinConfig account |
| `fetchRoleRegistry` | `config: PublicKey` | `Promise<RoleRegistry>` | Fetch the RoleRegistry account |
| `fetchMinterInfo` | `config: PublicKey, minter: PublicKey` | `Promise<MinterInfo>` | Fetch a MinterInfo account |
| `fetchBlacklistEntry` | `config: PublicKey, address: PublicKey` | `Promise<BlacklistEntry \| null>` | Fetch a BlacklistEntry or null if not blacklisted |
| `fetchReserveAttestation` | `config: PublicKey, index: BN \| number` | `Promise<ReserveAttestation>` | Fetch a ReserveAttestation by index |

### Instructions

All instruction methods return `Promise<{ signature: string }>`.

| Method | Parameters | Description |
|--------|-----------|-------------|
| `initialize` | `params: InitializeParams, mintKeypair: Keypair, hookProgramId?: PublicKey` | Initialize a new stablecoin. Pass `hookProgramId` for SSS-2. |
| `mintTokens` | `mint: PublicKey, amount: BN, recipientTokenAccount: PublicKey` | Mint tokens. Caller must be an active minter with sufficient quota. |
| `burnTokens` | `mint: PublicKey, amount: BN, burnerTokenAccount: PublicKey` | Burn tokens from the caller's token account. |
| `freezeAccount` | `mint: PublicKey, targetTokenAccount: PublicKey` | Freeze a token account. Requires master authority or pauser role. |
| `thawAccount` | `mint: PublicKey, targetTokenAccount: PublicKey` | Thaw a frozen token account. Requires master authority or pauser role. |
| `pause` | `mint: PublicKey` | Pause all minting and burning. Requires pauser role. |
| `unpause` | `mint: PublicKey` | Resume operations. Requires pauser role. |
| `updateRoles` | `mint: PublicKey, params: UpdateRoleParams` | Assign a role to a new holder. Requires master authority. |
| `updateMinter` | `mint: PublicKey, minterWallet: PublicKey, params: UpdateMinterParams` | Create or update a minter. Requires master authority. |
| `transferAuthority` | `mint: PublicKey, newAuthority: PublicKey` | Transfer master authority. Requires current master authority. |
| `blacklistAdd` | `mint: PublicKey, address: PublicKey, targetTokenAccount: PublicKey, params: BlacklistAddParams` | Blacklist an address and freeze their token account. SSS-2 only. |
| `blacklistRemove` | `mint: PublicKey, address: PublicKey, targetTokenAccount: PublicKey` | Remove an address from the blacklist and thaw their account. SSS-2 only. |
| `seize` | `mint: PublicKey, blacklistedAddress: PublicKey, fromTokenAccount: PublicKey, toTokenAccount: PublicKey, amount: BN` | Seize tokens from a blacklisted address. SSS-2 only. |
| `attestReserve` | `mint: PublicKey, params: AttestReserveParams` | Record an on-chain reserve attestation. Requires master authority. |
| `initializeExtraAccountMetaList` | `mint: PublicKey` | Initialize the ExtraAccountMetaList for the transfer hook. Called once per mint. |

### Utilities

| Method | Parameters | Returns | Description |
|--------|-----------|---------|-------------|
| `getAssociatedTokenAddress` | `mint: PublicKey, owner: PublicKey` | `PublicKey` | Derive the Token-2022 ATA for a mint/owner pair |
| `createAssociatedTokenAccountInstruction` | `payer: PublicKey, mint: PublicKey, owner: PublicKey` | `TransactionInstruction` | Build an ATA creation instruction for Token-2022 |

## Event Parsing

The SDK provides utilities to parse Anchor events from transaction logs.

```typescript
import { createEventParser, parseTransactionEvents } from "solana-stablecoin-standard";

// Parse events from a transaction
const tx = await connection.getTransaction(signature, {
  commitment: "confirmed",
});
const events = parseTransactionEvents(client.tokenProgram, tx.meta.logMessages);

for (const event of events) {
  switch (event.name) {
    case "tokensMinted":
      console.log(`Minted ${event.data.amount} tokens`);
      break;
    case "blacklistAdded":
      console.log(`Blacklisted ${event.data.blockedAddress}`);
      break;
  }
}
```

**Supported event types**: `StablecoinInitialized`, `TokensMinted`, `TokensBurned`, `AccountFrozen`, `AccountThawed`, `ProgramPaused`, `ProgramUnpaused`, `RoleUpdated`, `MinterUpdated`, `AuthorityTransferred`, `BlacklistAdded`, `BlacklistRemoved`, `TokensSeized`, `AuditLogRecorded`.

## Oracle Module

The `OracleModule` provides Pyth price feed integration and reserve data construction.

```typescript
import { OracleModule } from "solana-stablecoin-standard";

const oracle = new OracleModule(connection);

// Fetch a Pyth price
const price = await oracle.fetchPythPrice(pythUsdcFeedAccount);
console.log(OracleModule.formatPrice(price.price, price.exponent));

// Build reserve attestation data
const reserveData = await oracle.buildReserveData({
  reserveComponents: [
    { name: "US Treasury Bills", amountUsd: 800_000 },
    { name: "Bank Deposits", amountUsd: 200_000 },
  ],
  outstandingSupply: new BN(1_000_000_000_000), // 1M tokens (6 decimals)
  attestationUri: "https://example.com/audit/2026-02.pdf",
});

// Use in attestation instruction
await client.attestReserve(mint, {
  reserveHash: reserveData.reserveHash,
  totalReservesUsd: reserveData.totalReservesUsd,
  totalOutstanding: reserveData.totalOutstanding,
  attestationUri: reserveData.attestationUri,
});
```

### OracleModule Methods

| Method | Description |
|--------|-------------|
| `fetchPythPrice(priceFeedAccount)` | Fetch the current price from a Pyth V2 price feed account |
| `buildReserveData(params)` | Build a `ReserveData` object from reserve components, computing the hash and collateralization ratio |
| `computeReserveHash(data)` | Compute a SHA-256 hash from arbitrary data (string or Buffer) |
| `OracleModule.formatPrice(price, exponent)` | Format a Pyth price as a USD string (static method) |

## Presets Helper

```typescript
import { PRESET_CONFIGS, getPresetAnchorEnum, StablecoinPreset } from "solana-stablecoin-standard";

// Get the full preset configuration
const sss2Config = PRESET_CONFIGS[StablecoinPreset.SSS2];
// {
//   preset: { sss2: {} },
//   enablePermanentDelegate: true,
//   enableTransferHook: true,
//   defaultAccountFrozen: false,
//   enableConfidentialTransfers: false,
// }

// Get just the Anchor enum variant for instruction params
const presetEnum = getPresetAnchorEnum(StablecoinPreset.SSS2);
// { sss2: {} }
```

## Error Handling

All client methods wrap Anchor errors into `SSSError` instances with typed error codes.

```typescript
import { SSSError } from "solana-stablecoin-standard";

try {
  await client.mintTokens(mint, amount, recipientATA);
} catch (err) {
  if (err instanceof SSSError) {
    console.log(err.code);      // 6005
    console.log(err.errorName);  // "MintQuotaExceeded"
    console.log(err.message);    // "MintQuotaExceeded (6005): Mint amount exceeds minter quota"
  }
}
```

## Constants

```typescript
import {
  SSS_TOKEN_PROGRAM_ID,          // 5ZBiFxX4ggWfNR5VhAQDRZauG6CvG84puS4SQiH8BcL4
  SSS_TRANSFER_HOOK_PROGRAM_ID,  // FmujD82V5FB6Nus7mbEV2a7cp5HG32gsiHykmtNSRJxy
  TOKEN_2022_PROGRAM_ID,         // TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb
  ASSOCIATED_TOKEN_PROGRAM_ID,   // ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL
  SEEDS,                         // PDA seed buffers
} from "solana-stablecoin-standard";
```

## License

MIT
