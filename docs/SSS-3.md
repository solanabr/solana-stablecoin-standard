# SSS-3: Private Stablecoin Standard

> **Status**: Experimental (proof-of-concept)  
> **Program**: `sss_token`  
> **Extensions**: SSS-1 + Confidential Transfers (Token-2022)

## Overview

SSS-3 extends [SSS-1](./SSS-1.md) with confidential transfers using Token-2022's Confidential Transfer extension. Transfer amounts are encrypted using ElGamal encryption — only the sender, receiver, and auditor can see the actual amounts.

**Use cases**: Privacy-preserving stablecoins, payroll systems, private B2B settlements.

> ⚠️ **Experimental**: Confidential Transfers tooling on Solana is still maturing. SSS-3 is a proof-of-concept demonstrating the pattern.

## How It Works

1. **Initialization**: Token is created with `enable_confidential_transfers: true`
2. **Configuration**: The mint's confidential transfer authority configures the extension
3. **Deposit**: User deposits public tokens into their confidential balance
4. **Transfer**: Encrypted transfers between confidential balances
5. **Withdraw**: User withdraws from confidential balance to public balance

## SDK Usage

```typescript
const stable = await SolanaStablecoin.create(connection, wallet, {
  preset: Presets.SSS_3,
  name: "Private USD",
  symbol: "pUSD",
  decimals: 6,
});
```

## Limitations

- Requires client-side ElGamal key management
- Proof generation is computationally expensive
- Auditor key is required for regulatory compliance
- Not compatible with SSS-2 compliance module (blacklist checks need visible amounts)
