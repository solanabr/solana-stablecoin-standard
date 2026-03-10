---
title: Agent Guide
description: Compact, copy-paste-first reference for LLM agents integrating the Solana Stablecoin Standard SDK.
---

# Agent Guide

Use this page as the shortest reliable context block for SSS integrations.

## Install

```bash
npm install solana-stablecoin-standard@0.2.1 @coral-xyz/anchor @solana/web3.js @solana/spl-token bn.js
```

## Core Imports

```ts
import {Connection, Keypair, PublicKey} from "@solana/web3.js";
import {Wallet, BN} from "@coral-xyz/anchor";
import {
  SSSClient,
  StablecoinPreset,
  Role,
  buildInitializeParams,
  parseTransactionEvents,
  OracleModule,
} from "solana-stablecoin-standard";
```

## Constructor

```ts
new SSSClient(connection: Connection, wallet: Wallet, options?: {
  tokenProgramId?: PublicKey;
  hookProgramId?: PublicKey;
  provider?: AnchorProvider;
})
```

## Canonical Init Flow

```ts
const connection = new Connection("https://api.devnet.solana.com", "confirmed");
const wallet = new Wallet(Keypair.generate());
const client = new SSSClient(connection, wallet);
const mint = Keypair.generate();

await client.initialize(
  buildInitializeParams("USD Coin", "USDC", "https://example.com/meta.json", 6, StablecoinPreset.SSS2),
  mint,
  client.hookProgramId
);

await client.initializeExtraAccountMetaList(mint.publicKey);
```

## Method Signatures

### State Reads

```ts
fetchConfig(mint: PublicKey): Promise<StablecoinConfig>
fetchRoleRegistry(config: PublicKey): Promise<RoleRegistry>
fetchMinterInfo(config: PublicKey, minter: PublicKey): Promise<MinterInfo>
fetchBlacklistEntry(config: PublicKey, address: PublicKey): Promise<BlacklistEntry | null>
fetchReserveAttestation(config: PublicKey, index: BN | number): Promise<ReserveAttestation>
getTotalSupply(mint: PublicKey): Promise<{ totalMinted: BN; totalBurned: BN; currentSupply: BN; decimals: number }>
getTokenSupply(mint: PublicKey): Promise<{ amount: string; decimals: number; uiAmount: number | null }>
fetchAllMinters(mint: PublicKey): Promise<{ pubkey: PublicKey; account: MinterInfo }[]>
fetchTokenHolders(mint: PublicKey): Promise<{ address: PublicKey; amount: string; uiAmount: number | null }[]>
```

### Transactions

```ts
initialize(params: InitializeParams, mintKeypair: Keypair, hookProgramId?: PublicKey): Promise<{ signature: string }>
mintTokens(mint: PublicKey, amount: BN, recipientTokenAccount: PublicKey): Promise<{ signature: string }>
burnTokens(mint: PublicKey, amount: BN, burnerTokenAccount: PublicKey): Promise<{ signature: string }>
freezeAccount(mint: PublicKey, targetTokenAccount: PublicKey): Promise<{ signature: string }>
thawAccount(mint: PublicKey, targetTokenAccount: PublicKey): Promise<{ signature: string }>
pause(mint: PublicKey): Promise<{ signature: string }>
unpause(mint: PublicKey): Promise<{ signature: string }>
updateRoles(mint: PublicKey, params: UpdateRoleParams): Promise<{ signature: string }>
updateMinter(mint: PublicKey, minterWallet: PublicKey, params: UpdateMinterParams): Promise<{ signature: string }>
transferAuthority(mint: PublicKey, newAuthority: PublicKey): Promise<{ signature: string }>
blacklistAdd(mint: PublicKey, address: PublicKey, targetTokenAccount: PublicKey, params: BlacklistAddParams): Promise<{ signature: string }>
blacklistRemove(mint: PublicKey, address: PublicKey, targetTokenAccount: PublicKey): Promise<{ signature: string }>
seize(mint: PublicKey, blacklistedAddress: PublicKey, fromTokenAccount: PublicKey, toTokenAccount: PublicKey, amount: BN): Promise<{ signature: string }>
attestReserve(mint: PublicKey, params: AttestReserveParams): Promise<{ signature: string }>
initializeExtraAccountMetaList(mint: PublicKey): Promise<{ signature: string }>
```

### Utility Helpers

```ts
getAssociatedTokenAddress(mint: PublicKey, owner: PublicKey): PublicKey
createAssociatedTokenAccountInstruction(payer: PublicKey, mint: PublicKey, owner: PublicKey): TransactionInstruction
getConfigPda(mint: PublicKey): [PublicKey, number]
getRoleRegistryPda(config: PublicKey): [PublicKey, number]
getMinterInfoPda(config: PublicKey, minter: PublicKey): [PublicKey, number]
getBlacklistPda(config: PublicKey, address: PublicKey): [PublicKey, number]
getReserveAttestationPda(config: PublicKey, index: BN | number): [PublicKey, number]
getExtraAccountMetaListPda(mint: PublicKey): [PublicKey, number]
```

## Common Patterns

### Register A Minter

```ts
await client.updateMinter(mint, wallet.publicKey, {
  isActive: true,
  mintQuota: new BN(1_000_000_000_000),
});
```

### Mint Tokens

```ts
const recipientAta = client.getAssociatedTokenAddress(mint, recipient);
await client.mintTokens(mint, new BN(500_000_000), recipientAta);
```

### Blacklist And Seize

```ts
await client.blacklistAdd(mint, blockedWallet, blockedAta, {
  reason: "screening hit",
});

await client.seize(
  mint,
  blockedWallet,
  blockedAta,
  treasuryAta,
  new BN(100_000_000)
);
```

### Reserve Attestation

```ts
const oracle = new OracleModule(connection);
const reserve = await oracle.buildReserveData({
  reserveComponents: [{name: "T-Bills", amountUsd: 1_000_000}],
  outstandingSupply: new BN(1_000_000_000_000),
  attestationUri: "https://issuer.example/report.pdf",
});

await client.attestReserve(mint, {
  reserveHash: reserve.reserveHash,
  totalReservesUsd: reserve.totalReservesUsd,
  totalOutstanding: reserve.totalOutstanding,
  attestationUri: reserve.attestationUri,
});
```

### Parse Events

```ts
const tx = await connection.getTransaction(signature, {commitment: "confirmed"});
const events = parseTransactionEvents(client.tokenProgram, tx?.meta?.logMessages ?? []);
```

## Error Handling

```ts
import {SSSError} from "solana-stablecoin-standard";

try {
  await client.mintTokens(mint, amount, recipientAta);
} catch (err) {
  const sssErr = SSSError.fromAnchorError(err);
  if (sssErr) {
    console.error(sssErr.code, sssErr.errorName, sssErr.message);
  }
}
```

## High-Signal Caveats

- SSS-2 requires `initializeExtraAccountMetaList` after `initialize`
- `fetchRoleRegistry`, `fetchMinterInfo`, `fetchBlacklistEntry`, and `fetchReserveAttestation` expect the config PDA, not the mint
- `blacklistAdd` and `blacklistRemove` need the target token account, not just the wallet
- `fetchBlacklistEntry` returns `null` on any fetch failure
- transfer-hook errors share numeric codes with token-program errors, so `SSSError.fromCode` is not reliable for hook-specific decoding
- `attestReserve` persists a PDA but the current program does not emit a dedicated attestation event
- `AuditLogEntry` and `AuditLogRecorded` exist in source but are not currently used
