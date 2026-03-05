# SSS-3: Private Stablecoin Specification

## Overview

SSS-3 is the privacy-preserving stablecoin preset, powered by [Cloak Protocol](https://cloak.ag). It enables confidential transactions while maintaining regulatory compliance through a novel "Compliance at the Boundary" model.

## When to Use SSS-3

SSS-3 is ideal for:
- Institutional stablecoins requiring privacy
- Cross-border payments needing confidentiality
- Treasury operations requiring discretion
- Compliance-sensitive jurisdictions (GENIUS Act, MiCA alignment)

## Key Features

### 1. Shielded Transactions

All transfers between shielded addresses are private. The UTXO model ensures:
- Sender and receiver addresses are hidden
- Transaction amounts are encrypted
- History is unlinkable without viewing key

### 2. Viewing Key Hierarchy

SSS-3 implements a sophisticated viewing key system:

| Key Type | Capabilities |
|----------|--------------|
| **Issuer Master Key** | Decrypt ALL transactions for the stablecoin |
| **Compliance Officer Key** | Decrypt transactions for specific addresses |
| **Auditor Key** | Read-only, time-bounded access |

```typescript
// Register viewing key with scope
await stablecoin.privacy.registerViewingKey(authority, {
  type: 'issuer',  // or 'compliance', 'auditor'
  mint: stablecoinMint,
  constraints: {
    addresses: [specificAddress],  // for compliance officer
    timeRange: [startDate, endDate],  // for auditor
  }
});
```

### 3. Compliance at the Boundary

Unlike SSS-2's reactive blacklist model, SSS-3 enforces compliance at the privacy boundary:

```
┌─────────────────────────────────────────────────────┐
│                   PUBLIC LAYER                      │
│  ┌─────────┐    ┌──────────┐    ┌─────────────┐   │
│  │ Mint    │───▶│ Shield   │───▶│ Relay Check │   │
│  │         │    │ Pool     │    │ (Sanctions) │   │
│  └─────────┘    └──────────┘    └──────┬──────┘   │
└─────────────────────────────────────────┼──────────┘
                                          │
┌─────────────────────────────────────────┼──────────┐
│              SHIELDED LAYER             │          │
│  ┌──────────────────────────────────────▼────────┐ │
│  │         Cloak UTXO Pool                      │ │
│  │    (Private 2-in-2-out transfers)           │ │
│  └──────────────────────────────────────┬────────┘ │
└─────────────────────────────────────────┼──────────┘
                                          │
┌─────────────────────────────────────────┼──────────┐
│                   PUBLIC LAYER          │          │
│  ┌──────┐    ┌──────────┐    ┌────────▼──────┐  │
│  │Unshield│◀──│ Relay    │◀───│ Relay Check   │  │
│  │       │    │ Approves │    │ (Sanctions)   │  │
│  └──────┘    └──────────┘    └───────────────┘  │
└───────────────────────────────────────────────────┘
```

**Key Insight**: Compliance happens at shield and unshield points. Private transfers within the pool require no compliance checks—only boundary crossings are monitored.

### 4. Sanctions Screening

At unshield (withdrawal), the relay performs:
- OFAC sanctions check
- Counter-party risk assessment
- Geographic restriction verification

If clean, the relay signs an authorization envelope that allows the withdrawal without exposing the sender's transaction history.

## Privacy Model Comparison

| Aspect | SSS-2 (Compliant) | SSS-3 (Private) |
|--------|-------------------|-----------------|
| Transaction Visibility | Full public | Encrypted |
| Blacklist Timing | Before transfer | At boundary |
| Compliance Model | Reactive | Proactive |
| Data Exposure | All on-chain | Selective |
| Regulatory Approach | Restrictive | Transparent-friendly |
| Audit Capability | Full chain analysis | Selective key-based |

## Integration with Cloak Protocol

SSS-3 leverages Cloak's production-grade privacy infrastructure:

1. **Shield Pool Program**: Manages encrypted UTXO state
2. **Relay Service**: Coordinates transactions, performs compliance checks
3. **ZK Circuits**: 2-in-2-out proofs for private transfers
4. **Viewing Key System**: Selective disclosure mechanism

### API Surface

```typescript
// Shield deposit - convert public tokens to private
await stablecoin.privacy.shieldDeposit(1000n, wallet);

// Private transfer - untraceable between shielded addresses
await stablecoin.privacy.privateTransfer(recipient, 500n, wallet);

// Unshield - convert private tokens back to public
await stablecoin.privacy.unshieldWithdraw(250n, recipient, wallet);

// Register viewing key for compliance
await stablecoin.privacy.registerViewingKey(authority, { type: 'issuer' });

// Export audit trail (for authorized parties)
const auditTrail = await stablecoin.privacy.exportAuditTrail(viewingKey);
```

## GENIUS Act & MiCA Alignment

SSS-3's architecture aligns with emerging regulations:

### GENIUS Act (US)
- ✅ Sanctions screening at boundary (required)
- ✅ Transaction monitoring capability (viewing keys)
- ✅ Asset seizure capability (unshield freeze)
- ✅ No pre-funding requirement (relay model)

### MiCA (EU)
- ✅ Reserve transparency (auditor viewing keys)
- ✅ Transaction reporting (selective disclosure)
- ✅ Privacy by default (encrypted transfers)

## Trust Assumptions

SSS-3 assumes:

1. **Relay Trust Boundary**: The relay operator cannot:
   - Forge proofs
   - Steal funds
   - Decrypt transactions without viewing key
   
2. **Viewing Key Security**: Holders must secure their viewing keys—anyone with the key can decrypt transactions

3. **ZK Proof Soundness**: Cryptographic proofs are verified on-chain

## Implementation Notes

The SSS-3 privacy module is designed with a pluggable architecture:

```typescript
// Interface definition
interface PrivacyProvider {
  shieldDeposit(amount: bigint, wallet: Keypair): Promise<string>;
  privateTransfer(recipient: PublicKey, amount: bigint, wallet: Keypair): Promise<string>;
  unshieldWithdraw(amount: bigint, recipient: PublicKey, wallet: Keypair): Promise<string>;
  registerViewingKey(authority: Keypair, scope: ViewingKeyScope): Promise<string>;
  exportAuditTrail(viewingKey: Keypair): Promise<AuditEntry[]>;
  getShieldedBalance(wallet: Keypair): Promise<bigint>;
}

// Implementations
- MockPrivacyProvider: For testing
- CloakPrivacyProvider: Production (HTTP calls to relay)
```

## Conclusion

SSS-3 represents the next evolution in stablecoin compliance. Instead of the blunt instrument of public blacklists, it offers sophisticated, privacy-preserving controls that satisfy regulators while respecting user privacy. This is the direction stablecoin regulation is heading—and SSS-3 is ready today.
