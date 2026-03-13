# Privacy (SSS-3)

## Confidential Transfers

SSS-3 extends the base stablecoin with Token-2022's Confidential Transfer extension, enabling private token transfers where amounts are encrypted on-chain.

### How It Works

1. **ElGamal Encryption**: Transfer amounts are encrypted using the ElGamal encryption scheme
2. **Zero-Knowledge Proofs**: Senders prove they have sufficient balance without revealing amounts
3. **On-Chain Verification**: The Token-2022 program verifies proofs during transfer

### Features

- Encrypted balances — only account owner can decrypt
- Private transfers — amounts hidden from public view
- Compliance compatible — authority can decrypt with auditor key
- Built on Solana's native confidential transfer extension

### Status

🚧 **SSS-3 is planned as a bonus feature.** The architecture supports it via Token-2022's `ConfidentialTransfer` extension, but the implementation is not yet complete.

### Architecture

```
SSS-3 = SSS-1 (Base) + Confidential Transfer Extension
                      + ElGamal keypair per account
                      + Zero-knowledge proof generation (client-side)
```

### References

- [SPL Confidential Transfers](https://spl.solana.com/confidential-token)
- [Solana ZK SDK](https://docs.rs/solana-zk-sdk)
