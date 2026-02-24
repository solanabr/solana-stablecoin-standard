# SSS-1: Minimal Preset

SSS-1 is the simplest stablecoin preset. It provides core token management capabilities without compliance enforcement or privacy features.

## Token-2022 Extensions

| Extension | Configuration | Purpose |
|---|---|---|
| MetadataPointer | Authority: config PDA, Address: mint | On-chain token metadata (name, symbol, URI) |
| PermanentDelegate | Delegate: config PDA | Enables burn-from-any and seize operations |

## Mint Authority Model

The config PDA (`["sss-config", mint]`) is assigned as:

- **Mint authority** -- Controls token minting
- **Freeze authority** -- Controls account freezing
- **Permanent delegate** -- Can transfer or burn from any token account
- **Metadata update authority** -- Can update token metadata

All operations go through the `sss-core` program, which validates role-based access before signing with the config PDA.

## Capabilities

| Operation | Required Role | Paused Behavior |
|---|---|---|
| Mint tokens | Minter | Blocked |
| Burn tokens | Minter | Blocked |
| Freeze account | Freezer | Blocked |
| Thaw account | Freezer | Blocked |
| Pause | Pauser | Must be unpaused |
| Unpause | Pauser | Must be paused |
| Seize tokens | Admin | **Not blocked** |
| Grant role | Admin | Not affected |
| Revoke role | Admin | Not affected |
| Update supply cap | Admin | Not affected |

## Mint Creation Flow

When `SSS.create()` is called with `preset: "sss-1"`, the SDK builds a single transaction containing:

1. `SystemProgram.createAccount` -- Allocate the mint account (owned by Token-2022)
2. `initializeMetadataPointer` -- Set config PDA as metadata authority, mint as metadata address
3. `initializePermanentDelegate` -- Set config PDA as permanent delegate
4. `initializeMint2` -- Set config PDA as mint authority and freeze authority
5. `initializeMetadata` -- Write name, symbol, and URI to the mint account
6. `sss-core::initialize` -- Create the StablecoinConfig PDA and initial admin role PDA

## Use Cases

- **Internal tokens** -- Company-internal point systems or reward tokens
- **Development and testing** -- Prototyping stablecoin mechanics before adding compliance
- **Simple stablecoins** -- Tokens backed by reserves without regulatory requirements
- **Gaming tokens** -- In-game currencies with centralized management

## Limitations

- **No transfer compliance** -- No transfer hook means transfers cannot be intercepted or blocked at the protocol level. Blacklisting requires SSS-2.
- **No privacy** -- All balances and transfer amounts are visible on-chain. Privacy requires SSS-3.
- **No KYC gating** -- New token accounts are active immediately. SSS-2 starts accounts frozen for KYC verification before enabling transfers.

## Example

```typescript
import { SSS } from "@sss/sdk";

// Create
const sss = await SSS.create(provider, {
  preset: "sss-1",
  name: "Simple Token",
  symbol: "SMPL",
  decimals: 6,
  supplyCap: 1_000_000_000_000n,
});

// Set up roles
await sss.roles.grant(minterWallet, "minter");
await sss.roles.grant(freezerWallet, "freezer");
await sss.roles.grant(pauserWallet, "pauser");

// Mint
await sss.mintTokens(recipientTokenAccount, 100_000_000n);

// Check info
const info = await sss.info();
// { preset: "sss-1", currentSupply: 100000000n, paused: false, ... }
```

## Upgrading to SSS-2 or SSS-3

SSS-1 cannot be upgraded to SSS-2 or SSS-3 in place because Token-2022 extensions must be set before the mint is initialized. To migrate:

1. Create a new stablecoin with the desired preset
2. Mint equivalent tokens on the new mint
3. Facilitate token swaps from old to new
4. Burn tokens from the old mint as they are redeemed
