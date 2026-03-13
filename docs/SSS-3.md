# SSS-3: Private Stablecoin (Confidential Transfers)

_Note: SSS-3 is an Experimental Standard intended as a proof-of-concept for institutional entities requiring on-chain payment privacy while remaining compliant._

## Concept
SSS-3 builds on SSS-2 (The Compliant Stablecoin) by introducing the **Confidential Transfers** Token-2022 extension in conjunction with **Scoped Allowlists**. This allows issuers to obscure transaction amounts from public explorers while ensuring that the identities involved remain known to the compliance layer (via zero-knowledge proofs).

## Components

### 1. Account Encryption
Instead of storing raw `amount: u64` natively mapped to the token account struct, SSS-3 utilizes ElGamal encryption to mask balances.

### 2. Compliant Zero-Knowledge
Transactions submitted to the network include ZK-proofs proving that:
- The sender has sufficient encrypted balance.
- Neither sender nor receiver is on the `BlacklistRegistry` (proved via the SSS-2 Transfer Hook constraint).
- The transferred amount is greater than zero and does not violate min/max transfer quotas.

### 3. SSS Auditor Role
SSS-3 introduces an `AuditorRegistry` and a global Auditor key. This key (typically held by regulators or internal compliance teams) holds the decryption keys necessary to audit specific transactions off-chain without piercing the veil of privacy for the broader network.

## Implementation Path
The Token-2022 Confidential Transfer extension is still maturing within the Solana Mainnet-Beta environment. 

To enable this inside SSS:
1. Pass `enable_confidential_transfers: true` to the `SolanaStablecoin.create()` preset.
2. The core Anchor program expands the PDA structure to assign the `ElGamal` auditor public key.
3. The SDK automatically wraps standard `spl_transfer_checked` commands into ZK-proof generation boundaries before emitting transactions.

### Limitations
- Significantly higher computational cost (CUs) per transfer.
- Not supported universally by all Solana wallets yet.
- Difficult to parse natively without specialized backend indexers.

***
_Designed by Mayckon Giovani for the Solana Stablecoin Standard Protocol._
