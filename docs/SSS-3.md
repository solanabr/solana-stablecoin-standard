# SSS-3: Private Stablecoin (Experimental)

> **Status: Proof-of-Concept** — Token-2022 confidential transfer tooling is still maturing. This module documents the design and provides a reference implementation for future development.

## Overview

SSS-3 extends SSS-1 with privacy-preserving transfers using Token-2022's confidential transfer extension and scoped allowlists.

**Use cases:** Privacy-preserving stablecoins for payroll, B2B settlements, healthcare payments, and any scenario where transfer amounts should be confidential.

## Concept

```
SSS-3 = SSS-1 + Confidential Transfers + Scoped Allowlists
```

### Confidential Transfers

Transfer amounts are encrypted using ElGamal encryption on the Ed25519 curve. Only three parties can see the amount:

1. **Sender** — Has the source decryption key
2. **Recipient** — Has the destination decryption key
3. **Auditor** — Has a global auditor key (set at initialization)

To everyone else on-chain, the transfer amount appears as encrypted ciphertext.

### Scoped Allowlists

Only addresses on the allowlist can participate in confidential transfers. This creates a **privacy-preserving compliance layer**:

- Addresses must be approved before using confidential mode
- The issuer maintains control over who can transact privately
- KYC/AML can be performed off-chain before allowlisting
- Non-allowlisted addresses can still use normal (non-confidential) transfers

## Architecture

### On-Chain Accounts

```
PrivacyConfig PDA
  seeds: ["privacy_config", stablecoin_config]
  ├── authority: Pubkey
  ├── enabled: bool
  ├── auditor_elgamal_pubkey: [u8; 32]
  ├── max_confidential_amount: u64
  └── bump: u8

AllowlistEntry PDA
  seeds: ["allowlist", privacy_config, account]
  ├── approved_by: Pubkey
  ├── approved_at: i64
  └── bump: u8
```

### Instructions

| Instruction | Description |
|------------|-------------|
| `initialize_privacy` | Set up privacy config with auditor key |
| `add_to_allowlist` | Approve an address for confidential transfers |
| `remove_from_allowlist` | Revoke approval |
| `toggle_privacy` | Enable/disable the privacy module |

## Limitations

1. **Tooling maturity** — Token-2022 confidential transfer libraries are evolving
2. **ZK proof generation** — Requires specialized client-side computation
3. **Wallet support** — Not all wallets support confidential transfer UX
4. **Performance** — ZK proof generation adds latency (~100-500ms per transfer)
5. **Composability** — Confidential balances are harder to integrate with DeFi protocols

## Future Work

- Full integration with Token-2022 confidential transfer extension
- Client-side ZK proof generation in the TypeScript SDK
- Auditor dashboard for decrypting and monitoring transfers
- Integration with SSS-2 compliance (confidential + compliant)
- Range proofs for transfer amount limits
