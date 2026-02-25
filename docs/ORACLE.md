# Oracle Integration Module

The oracle-pricing program provides exchange rate feeds for non-USD stablecoin pegs (BRL, EUR, CPI-indexed). It reads Switchboard V2 aggregator accounts on-chain and exposes pricing data that can be used for mint/redeem calculations.

## Architecture

The oracle is a **separate program** from sss-token. The stablecoin programs don't depend on it — it's an optional pricing layer that operators can deploy alongside their stablecoin.

```
Switchboard Aggregator (BRL/USD)
        │
        ▼
┌─────────────────────┐
│  oracle-pricing      │
│  PriceFeedConfig PDA │───► get_price → returns i64 fixed-point price
│  (per mint)          │         + emits PriceRead event
└─────────────────────┘         + sets return_data for CPI callers
```

Program ID: `62W3YccPPBB7W1RG6CEsXRPrujRvZMhZREHz6BtPnV7w`

## Data Model

### PriceFeedConfig (PDA)

Seeds: `["price_feed", mint.as_ref()]`

| Field | Type | Description |
|---|---|---|
| authority | Pubkey | Who can update this config |
| mint | Pubkey | Stablecoin mint this feed prices |
| feed | Pubkey | Switchboard aggregator address |
| pair_name | String (max 16) | Display name (e.g. "BRL/USD") |
| feed_decimals | u8 | Precision for fixed-point price |
| stale_after_secs | i64 | Max age before price is rejected |
| bump | u8 | PDA bump |

## Instructions

### initialize_feed

Create a PriceFeedConfig for a stablecoin mint.

```
initialize_feed(pair_name: String, feed_decimals: u8, stale_after_secs: i64)
```

Accounts: authority (signer, mut), mint, feed, price_feed_config (init), system_program

### update_feed

Update the feed address, pair name, decimals, or staleness threshold. Only the original authority can call this.

```
update_feed(pair_name: Option<String>, feed_decimals: Option<u8>, stale_after_secs: Option<i64>)
```

Accounts: authority (signer), price_feed_config (mut), feed

### get_price

Read the current price from the Switchboard aggregator. Validates staleness, rejects non-positive prices. Emits a `PriceRead` event and sets return data (8 bytes, i64 LE) for CPI consumers.

```
get_price()
```

Accounts: price_feed_config, feed

## Switchboard Integration

The program reads Switchboard V2 aggregator accounts by directly parsing raw bytes — no Switchboard SDK dependency. This keeps the build lightweight and avoids version conflicts.

- Price (f64): byte offset 112..120
- Timestamp (i64): byte offset 120..128

The program converts the f64 price to a fixed-point i64 using `feed_decimals` (e.g. 6 decimals: 5.43 → 5430000).

## Staleness Check

Every `get_price` call reads `Clock::get()` and compares the feed's last update timestamp against `stale_after_secs`. If the feed data is too old, the instruction fails with `StaleFeedPrice`.

## Usage Examples

### Deploy a price feed for a BRL-pegged stablecoin

```typescript
import { OraclePricing } from "../target/types/oracle_pricing";

// Initialize feed pointing to a Switchboard BRL/USD aggregator
await program.methods
  .initializeFeed("BRL/USD", 6, new BN(3600))
  .accounts({
    authority: authority.publicKey,
    mint: mintPublicKey,
    feed: switchboardAggregatorAddress,
    priceFeedConfig: priceFeedConfigPda,
    systemProgram: SystemProgram.programId,
  })
  .rpc();

// Read current price
await program.methods
  .getPrice()
  .accounts({
    priceFeedConfig: priceFeedConfigPda,
    feed: switchboardAggregatorAddress,
  })
  .rpc();
```

### Switch to a different aggregator

```typescript
await program.methods
  .updateFeed("EUR/USD", 8, new BN(7200))
  .accounts({
    authority: authority.publicKey,
    priceFeedConfig: priceFeedConfigPda,
    feed: newAggregatorAddress,
  })
  .rpc();
```

## Testing

The test suite uses mock Switchboard accounts — system-owned accounts created on localnet with zeroed data. The `get_price` instruction correctly rejects zero-price feeds with `NonPositivePrice`. Authority constraints are tested by verifying that unauthorized signers receive `ConstraintHasOne` errors.

For production testing with real Switchboard feeds, deploy to devnet and use a live aggregator such as `GvDMxPzN1sCj7L26YDK2HnMRXEQmQ2aemov8YBtPS7vR` (SOL/USD on Switchboard devnet).
