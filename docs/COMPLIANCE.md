# Compliance

This document covers the regulatory compliance capabilities of each SSS preset and their implications for stablecoin operators.

## Compliance by Preset

### SSS-1: No Compliance Features

SSS-1 provides no transfer-level compliance enforcement. All transfers proceed without restriction.

**Suitable for:**
- Internal tokens not subject to financial regulations
- Developer tools and testing environments
- Tokens where compliance is handled entirely off-chain

**Operator responsibility:** If SSS-1 tokens are used in regulated contexts, the operator must implement all compliance controls externally (off-chain KYC, transaction monitoring, sanctions screening).

### SSS-2: Preventive Compliance

SSS-2 enforces compliance at the transfer level through two mechanisms:

**Transfer Hook Blacklist**

Every token transfer passes through the `sss-transfer-hook` program, which checks both the sender and receiver against a per-mint blacklist. If either party is blacklisted, the transfer is rejected on-chain.

This provides:
- Real-time sanctions enforcement
- Immediate blocking of flagged addresses
- Auditable on-chain blacklist entries with timestamps and reasons

**Default Frozen Accounts (KYC Gating)**

New token accounts start in a frozen state. Holders cannot transfer tokens until an operator with the `freezer` role thaws the account. This creates a natural KYC checkpoint:

1. User requests a token account
2. User completes off-chain identity verification
3. Operator verifies KYC and thaws the account
4. User can now transact

**Suitable for:**
- Regulated stablecoins (money transmitter licenses)
- Tokens subject to AML/KYC requirements
- Government-issued digital currencies
- Institutional tokens requiring transfer restrictions

### SSS-3: Detective Compliance

SSS-3 takes a different approach: transfers are private, but an auditor key enables authorized parties to decrypt transfer amounts after the fact.

**Auditor Key Model**

An ElGamal public key is embedded in the ConfidentialTransferMint extension. Every confidential transfer encrypts the amount for three parties:

1. **Sender** -- Can decrypt to verify their outgoing transfer
2. **Recipient** -- Can decrypt to verify their incoming transfer
3. **Auditor** -- Can decrypt any transfer amount

The auditor key holder (e.g., a regulator, compliance officer, or law enforcement with proper authorization) can access transfer amounts without them being publicly visible.

**Properties:**
- Transfer amounts are hidden from the public
- Account balances are encrypted
- The auditor can reconstruct a complete transaction history for any account
- Deposits and withdrawals (public-to-confidential, confidential-to-public) are visible on-chain
- Only confidential-to-confidential transfers are fully private

**Suitable for:**
- Privacy-preserving stablecoins in jurisdictions allowing private transactions with regulatory access
- Institutional settlement where counterparties need privacy but regulators need visibility
- Healthcare or legal payment systems requiring confidentiality

## Regulatory Framework Considerations

### FATF Travel Rule

The FATF Travel Rule requires Virtual Asset Service Providers (VASPs) to exchange originator and beneficiary information for transfers above certain thresholds.

**SSS-1:** No built-in support. Operators must implement travel rule compliance entirely off-chain.

**SSS-2:** The blacklist mechanism can enforce VASP-level blocking, but the travel rule information exchange must happen off-chain. The on-chain blacklist can be updated in response to travel rule violations (e.g., blocking addresses that fail to provide required information). DefaultAccountState(Frozen) supports a gating model where accounts are only activated after the holder's VASP provides compliant information.

**SSS-3:** The auditor key enables regulatory access to transaction data. When a regulator needs travel rule information, the auditor can decrypt transfer amounts. Originator/beneficiary identity mapping must be maintained off-chain by the VASP. The privacy model is compatible with travel rule compliance as long as the auditor key holder cooperates with information requests.

### MiCA (Markets in Crypto-Assets Regulation)

MiCA requires e-money token issuers to maintain reserves, provide redemption rights, and comply with AML directives.

**SSS-2 alignment:**
- Supply cap enforcement provides a mechanism to limit issuance to match reserves
- Freeze/thaw provides account-level control for AML enforcement
- Blacklist provides real-time sanctions screening
- Pause provides an emergency circuit breaker as required by MiCA

**SSS-3 alignment:**
- The auditor key satisfies MiCA's requirement for competent authorities to access transaction data
- Supply management (mint/burn) supports reserve-backed issuance
- The privacy model may require review under MiCA's transparency requirements for e-money tokens

### AML/KYC Enforcement

| Capability | SSS-1 | SSS-2 | SSS-3 |
|---|---|---|---|
| On-chain KYC gating | -- | ✅ (frozen-by-default) | -- |
| Transaction blocking | -- | ✅ (transfer hook) | -- |
| Sanctions screening | -- | ✅ (blacklist) | -- |
| Transaction monitoring | Off-chain only | Off-chain + on-chain | Auditor key |
| SAR filing support | Manual | Manual + on-chain data | Auditor decryption |
| Account-level freeze | ✅ | ✅ | ✅ |
| Asset seizure | ✅ (seize) | ✅ (seize) | ✅ (seize, public balance only) |

## Comparison with Existing Stablecoin Compliance

### USDC Model

Circle's USDC uses a centralized blacklist maintained by Centre. Blacklisted addresses cannot send or receive USDC.

**SSS-2 comparison:**
- Similar blacklist enforcement at the transfer level
- SSS-2 uses Token-2022 transfer hooks (decentralized enforcement) vs. USDC's centralized contract
- SSS-2 adds KYC gating via frozen-by-default accounts
- SSS-2 blacklist entries include timestamps and reasons for audit trails

### USDT Model

Tether's USDT uses an address blacklist and centralized freeze capability.

**SSS comparison:**
- SSS provides the same freeze and seizure capabilities across all presets
- SSS-2 adds transfer-level blacklist enforcement (USDT blocks at the contract level)
- SSS-3 adds privacy that USDT does not offer
- SSS's role-based access control provides more granular operator separation than USDT's single-owner model

### CBDC Models

Central Bank Digital Currencies often require:
- Tiered access (retail vs. wholesale)
- Transaction limits
- Privacy with regulatory access
- Emergency controls

**SSS alignment:**
- SSS-2 provides tiered access via freeze/thaw (KYC tiers)
- Supply cap can enforce transaction limits at the issuance level
- SSS-3 provides privacy with auditor access
- All presets provide emergency pause and seizure capabilities

## Compliance Operations Checklist

For operators deploying SSS-2 or SSS-3 in regulated environments:

- [ ] Establish KYC/AML procedures for account onboarding (SSS-2: thaw after verification)
- [ ] Configure sanctions screening against OFAC SDN, EU sanctions lists, etc.
- [ ] Set up transaction monitoring (backend WebSocket listener + webhooks)
- [ ] Define blacklist procedures: who can add/remove, approval workflow, documentation requirements
- [ ] Establish SAR (Suspicious Activity Report) filing procedures
- [ ] Define and document the role assignment policy (separation of duties)
- [ ] For SSS-3: secure the auditor key and define access procedures for regulatory requests
- [ ] Set up the supply cap to match reserve holdings
- [ ] Document emergency procedures (pause, seize, blacklist)
- [ ] Conduct periodic compliance audits (role assignments, blacklist entries, supply vs. reserves)

## Limitations

- SSS does not implement on-chain identity verification -- KYC must happen off-chain
- The blacklist is per-address, not per-identity -- a blacklisted user can create new wallets
- SSS-3 seizure only works on public balances -- confidential balances cannot be forcibly transferred
- Transaction limits are not enforced at the transfer level (only at the supply level via cap)
- Travel rule information exchange is not automated -- requires off-chain infrastructure
