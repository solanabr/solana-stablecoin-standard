---
title: SDK Client
description: Source-verified reference for SSSClient, including constructor options, methods, params, return types, and practical caveats.
---

# `SSSClient`

`SSSClient` is the main SDK entry point. It wraps the bundled Anchor IDLs for `sss-token` and `sss-transfer-hook`, derives PDAs, fetches on-chain state, and submits transactions.

## Constructor

```ts
new SSSClient(
  connection: Connection,
  wallet: Wallet,
  options?: SSSClientOptions
)
```

### `SSSClientOptions`

| Field | Type | Notes |
| --- | --- | --- |
| `tokenProgramId` | `PublicKey` | Defaults to `SSS_TOKEN_PROGRAM_ID` |
| `hookProgramId` | `PublicKey` | Defaults to `SSS_TRANSFER_HOOK_PROGRAM_ID` |
| `provider` | `AnchorProvider` | If omitted, the client creates one with `commitment: "confirmed"` |

## Instance Properties

| Property | Type |
| --- | --- |
| `connection` | `Connection` |
| `provider` | `AnchorProvider` |
| `tokenProgram` | `Program` |
| `hookProgram` | `Program` |
| `tokenProgramId` | `PublicKey` |
| `hookProgramId` | `PublicKey` |

:::note
The client stores custom `tokenProgramId` and `hookProgramId` values and uses them for PDA derivation fields, but the Anchor `Program` instances are still constructed from bundled IDLs without an explicit program-id override. Treat cross-deployment retargeting as an advanced path that you should verify end to end.
:::

## PDA Helper Methods

| Method | Signature | Returns |
| --- | --- | --- |
| `getConfigPda` | `(mint: PublicKey)` | `[PublicKey, number]` |
| `getRoleRegistryPda` | `(config: PublicKey)` | `[PublicKey, number]` |
| `getMinterInfoPda` | `(config: PublicKey, minter: PublicKey)` | `[PublicKey, number]` |
| `getBlacklistPda` | `(config: PublicKey, address: PublicKey)` | `[PublicKey, number]` |
| `getReserveAttestationPda` | `(config: PublicKey, index: BN \| number)` | `[PublicKey, number]` |
| `getExtraAccountMetaListPda` | `(mint: PublicKey)` | `[PublicKey, number]` |

For raw helper functions and seed details, see [PDA Helpers](./pda).

## Account Fetchers

| Method | Signature | Returns | Notes |
| --- | --- | --- | --- |
| `fetchConfig` | `(mint: PublicKey)` | `Promise<StablecoinConfig>` | Derives the config PDA from the mint |
| `fetchRoleRegistry` | `(config: PublicKey)` | `Promise<RoleRegistry>` | Expects the config PDA, not the mint |
| `fetchMinterInfo` | `(config: PublicKey, minter: PublicKey)` | `Promise<MinterInfo>` | Reads a specific minter PDA |
| `fetchBlacklistEntry` | `(config: PublicKey, address: PublicKey)` | `Promise<BlacklistEntry \| null>` | Returns `null` on any fetch failure, not only “not found” |
| `fetchReserveAttestation` | `(config: PublicKey, index: BN \| number)` | `Promise<ReserveAttestation>` | Reads an attestation by index |

## Instruction Methods

Every instruction method returns:

```ts
Promise<{ signature: string }>
```

### `initialize`

```ts
initialize(
  params: InitializeParams,
  mintKeypair: Keypair,
  hookProgramId?: PublicKey
)
```

- creates the Token-2022 mint plus the `StablecoinConfig` and `RoleRegistry` PDAs
- signs with `mintKeypair`
- pass `hookProgramId` for transfer-hook-enabled mints such as `SSS2`

### `mintTokens`

```ts
mintTokens(
  mint: PublicKey,
  amount: BN,
  recipientTokenAccount: PublicKey
)
```

- the connected wallet is treated as the minter authority
- the client derives `MinterInfo` from `provider.wallet.publicKey`
- the recipient account must already exist

### `burnTokens`

```ts
burnTokens(
  mint: PublicKey,
  amount: BN,
  burnerTokenAccount: PublicKey
)
```

- self-burn works when the signer owns `burnerTokenAccount`
- the on-chain program also supports master-authority burns through the permanent delegate path

### `freezeAccount`

```ts
freezeAccount(mint: PublicKey, targetTokenAccount: PublicKey)
```

Requires master authority or pauser permissions on-chain.

### `thawAccount`

```ts
thawAccount(mint: PublicKey, targetTokenAccount: PublicKey)
```

Requires master authority or pauser permissions on-chain.

### `pause`

```ts
pause(mint: PublicKey)
```

Pauses mint and burn operations. It does not stop blacklist, freeze, or seizure flows.

### `unpause`

```ts
unpause(mint: PublicKey)
```

Resumes mint and burn operations.

### `updateRoles`

```ts
updateRoles(mint: PublicKey, params: UpdateRoleParams)
```

Updates `pauser`, `blacklister`, or `seizer`. Master authority transfer uses a different instruction.

### `updateMinter`

```ts
updateMinter(
  mint: PublicKey,
  minterWallet: PublicKey,
  params: UpdateMinterParams
)
```

Creates or updates the `MinterInfo` PDA for `minterWallet`.

### `transferAuthority`

```ts
transferAuthority(mint: PublicKey, newAuthority: PublicKey)
```

Transfers master authority. On-chain, `newAuthority` must appear as a signer account.

### `blacklistAdd`

```ts
blacklistAdd(
  mint: PublicKey,
  address: PublicKey,
  targetTokenAccount: PublicKey,
  params: BlacklistAddParams
)
```

- requires the wallet address and the actual token account to freeze
- the token account must belong to `address`

### `blacklistRemove`

```ts
blacklistRemove(
  mint: PublicKey,
  address: PublicKey,
  targetTokenAccount: PublicKey
)
```

- requires the same blocked wallet plus a token account owned by that wallet
- the blacklist PDA is closed on-chain after thawing

### `seize`

```ts
seize(
  mint: PublicKey,
  blacklistedAddress: PublicKey,
  fromTokenAccount: PublicKey,
  toTokenAccount: PublicKey,
  amount: BN
)
```

- `fromTokenAccount` must be owned by the blacklisted address
- `toTokenAccount` is usually an issuer treasury ATA
- the program performs `thaw -> burn -> mint -> refreeze`

### `attestReserve`

```ts
attestReserve(mint: PublicKey, params: AttestReserveParams)
```

- fetches config first
- derives the next attestation PDA from `config.reserveAttestationIndex`
- persists the attestation record on-chain

### `initializeExtraAccountMetaList`

```ts
initializeExtraAccountMetaList(mint: PublicKey)
```

This is a one-time SSS-2 setup call to the hook program. Transfers on hook-enabled mints are not ready until this account exists.

## Query Methods

| Method | Signature | Returns | Notes |
| --- | --- | --- | --- |
| `getTotalSupply` | `(mint: PublicKey)` | `Promise<{ totalMinted: BN; totalBurned: BN; currentSupply: BN; decimals: number }>` | Uses config counters |
| `getTokenSupply` | `(mint: PublicKey)` | `Promise<{ amount: string; decimals: number; uiAmount: number \| null }>` | Uses RPC `getTokenSupply` |
| `fetchAllMinters` | `(mint: PublicKey)` | `Promise<{ pubkey: PublicKey; account: MinterInfo }[]>` | Filters `minterInfo` accounts by config PDA |
| `fetchTokenHolders` | `(mint: PublicKey)` | `Promise<{ address: PublicKey; amount: string; uiAmount: number \| null }[]>` | Wraps `getTokenLargestAccounts`; not a full holder index |

## Utility Methods

| Method | Signature | Returns | Notes |
| --- | --- | --- | --- |
| `getAssociatedTokenAddress` | `(mint: PublicKey, owner: PublicKey)` | `PublicKey` | Uses Token-2022 and `allowOwnerOffCurve = true` |
| `createAssociatedTokenAccountInstruction` | `(payer: PublicKey, mint: PublicKey, owner: PublicKey)` | `TransactionInstruction` | Builds a Token-2022 ATA create instruction |

## Example

```ts
import {Connection, Keypair} from "@solana/web3.js";
import {Wallet, BN} from "@coral-xyz/anchor";
import {
  SSSClient,
  StablecoinPreset,
  buildInitializeParams,
} from "solana-stablecoin-standard";

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
await client.updateMinter(mint.publicKey, wallet.publicKey, {
  isActive: true,
  mintQuota: new BN(1_000_000_000_000),
});
```
