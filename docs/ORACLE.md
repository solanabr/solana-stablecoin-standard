# Oracle Integration Module

The `@stbr/sss-oracle` package integrates Switchboard price feeds for non-USD pegged stablecoins. The stablecoin token itself is pure SSS-1/SSS-2 — the oracle is an off-chain module used for:

1. **Mint/redeem pricing** — how many tokens to mint per USD deposited
2. **Peg monitoring** — circuit-breaker alerts when the peg deviates
3. **WebSocket subscriptions** — real-time price updates for trading UIs

## Supported Pegs

| Symbol | Description |
|--------|-------------|
| `USD/BRL` | Brazilian Real stablecoin (BRL) |
| `USD/EUR` | Euro stablecoin (EUR) |
| `USD/GBP` | British Pound stablecoin (GBP) |
| `XAU/USD` | Gold-backed stablecoin |
| `CPI/USD` | CPI-indexed inflation-adjusted stablecoin |

All feeds use [Switchboard on-demand](https://switchboard.xyz) pull oracles.

## Install

```bash
pnpm add @stbr/sss-oracle
```

## Usage

### Basic price fetch

```typescript
import { OracleModule } from "@stbr/sss-oracle";
import { Connection } from "@solana/web3.js";

const connection = new Connection("https://api.mainnet-beta.solana.com");
const oracle = new OracleModule(connection);

const feed = await oracle.getPrice("USD/BRL");
console.log(`1 USD = ${feed.price} BRL`);
// → 1 USD = 5.12 BRL
```

### Mint/redeem pricing

```typescript
// How many BRL stablecoin tokens to mint for 100 USDC?
const feed = await oracle.getPrice("USD/BRL");
const tokensToMint = 100 * feed.price * 1_000_000; // 6 decimals
// → mint 512_000_000 tokens (512 BRL)
```

### Peg deviation check (circuit-breaker)

```typescript
const info = await oracle.checkPeg(
  brlMintPubkey,
  "USD/BRL",
  1.0,         // 1 USD = 1 BRL stablecoin at peg
  200          // 200 bps = 2% threshold
);

if (!info.isPegged) {
  // Pause minting via sss-token program
  await program.methods.pause().accounts({ authority, config }).rpc();
  console.error(`De-peg! Deviation: ${info.deviationBps.toFixed(0)} bps`);
}
```

### Real-time subscription

```typescript
const unsubscribe = oracle.subscribe("USD/BRL", (feed) => {
  console.log(`Price update: ${feed.price} @ ${new Date(feed.lastUpdatedAt * 1000)}`);
});

// Later: stop listening
unsubscribe();
```

### Multiple feeds in one RPC call

```typescript
const prices = await oracle.getPrices(["USD/BRL", "USD/EUR", "XAU/USD"]);
for (const [symbol, feed] of prices) {
  console.log(`${symbol}: ${feed.price}`);
}
```

## Architecture

```
Off-chain oracle module              On-chain SSS program
┌──────────────────────┐             ┌──────────────────────┐
│  OracleModule        │             │  sss-token           │
│  ├── getPrice()      │  triggers   │  ├── mint_tokens     │
│  ├── checkPeg()      │ ──────────► │  ├── pause           │
│  └── subscribe()     │             │  └── burn_tokens     │
└──────────────────────┘             └──────────────────────┘
         │
         │ reads
         ▼
┌──────────────────────┐
│  Switchboard On-Demand│
│  Pull Oracle Feed     │
│  (on-chain account)   │
└──────────────────────┘
```

The oracle module is intentionally **read-only** — it never sends transactions. The application layer decides whether to pause, adjust mint rates, or alert operators based on price data.

## Custom Feed Address

```typescript
import { PublicKey } from "@solana/web3.js";

const myFeedAddress = new PublicKey("Your_Switchboard_Feed_Address");
const feed = await oracle.getPriceByAddress(myFeedAddress, "CUSTOM/USD");
```

## Adding a New Peg

1. Create a Switchboard on-demand feed for the pair
2. Add the feed address to `FEED_ADDRESSES` in `sdk/oracle/src/feeds.ts`
3. Deploy the SSS-1/SSS-2 mint with the matching `symbol` and `decimals`
4. Wire `OracleModule.checkPeg()` into your mint-burn service circuit-breaker
