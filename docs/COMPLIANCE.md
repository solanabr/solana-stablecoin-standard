# Regulatory Compliance Documentation

This document maps SSS-2 features to regulatory requirements, with a focus on the GENIUS Act (Guiding and Establishing National Innovation for U.S. Stablecoins). It provides a compliance checklist, OFAC screening workflow, attestation schedule, and role separation guidance.

## GENIUS Act Overview

The GENIUS Act establishes requirements for payment stablecoin issuers in the United States. Key obligations include maintaining adequate reserves, providing periodic attestations of reserve backing, enabling law enforcement cooperation, and implementing sanctions compliance controls.

SSS-2 provides on-chain primitives that directly address each of these requirements.

## Feature-to-Requirement Mapping

### Reserve Backing Attestation

**Requirement:** Stablecoin issuers must maintain reserves equal to or greater than the outstanding token supply, and must provide regular attestations of reserve adequacy.

**SSS-2 Implementation:** The `attest_reserve` instruction records immutable on-chain attestation records containing:

| Attestation Field | GENIUS Act Purpose |
|-------------------|-------------------|
| `reserve_hash` (SHA-256) | Cryptographic binding to the off-chain audit report; anyone can verify the hash matches the published document |
| `total_reserves_usd` | Declared total reserve value in USD cents |
| `total_outstanding` | Declared outstanding stablecoin supply at time of attestation |
| `attestation_uri` | Public link to the full audit report for independent verification |
| `attested_by` | On-chain identity of the attestation signer |
| `timestamp` | Immutable record of when the attestation was submitted |

Each attestation is stored as an immutable PDA with a sequential index. The full history of attestations is queryable on-chain.

**Verification:** Any party (regulators, auditors, the public) can:

1. Fetch `ReserveAttestation` PDA by index
2. Download the document at `attestation_uri`
3. Compute SHA-256 of the document and compare to `reserve_hash`
4. Verify `total_reserves_usd >= total_outstanding`
5. Check the `attested_by` address against known issuer keys

### Sanctions Compliance (OFAC)

**Requirement:** Issuers must not facilitate transactions involving sanctioned individuals or entities. The Office of Foreign Assets Control (OFAC) maintains the Specially Designated Nationals (SDN) list.

**SSS-2 Implementation:**

| SSS-2 Feature | OFAC Purpose |
|----------------|-------------|
| `blacklist_add` | Block a sanctioned address from sending or receiving tokens |
| Transfer hook enforcement | Automatically reject all transfers involving blacklisted addresses |
| Account freeze (via blacklist) | Prevent the blacklisted account from any token operations |
| BlacklistEntry PDA | On-chain record of the blacklisting action with reason and timestamp |

The transfer hook operates at the protocol level. Once an address is blacklisted, there is no way to bypass the restriction through alternative transfer paths -- Token-2022 invokes the hook on every `transfer_checked` call.

### Law Enforcement Cooperation (Seize)

**Requirement:** Issuers must be able to cooperate with law enforcement by freezing and recovering illicit funds when presented with a valid court order or regulatory directive.

**SSS-2 Implementation:**

| SSS-2 Feature | Law Enforcement Purpose |
|----------------|----------------------|
| `seize` (burn+mint) | Recover tokens from a blacklisted address to a designated treasury |
| Permanent delegate extension | Enables the program to burn tokens from any account without holder consent |
| Seizer role separation | Dedicated role for seizure operations, separate from blacklisting |
| `TokensSeized` event | On-chain audit trail of all seizure actions |

The seize operation is only possible against blacklisted addresses. The process is: blacklist first, then seize. This ensures there is always a documented reason before any asset recovery.

### Audit Trail (Events)

**Requirement:** Issuers must maintain comprehensive records of all significant operations for regulatory examination.

**SSS-2 Implementation:** Every state-changing operation emits an Anchor event and creates an immutable `AuditLogEntry` PDA.

| Action | Event | Audit Fields |
|--------|-------|-------------|
| Mint tokens | `TokensMinted` | Minter, recipient, amount, running total |
| Burn tokens | `TokensBurned` | Burner, from account, amount, running total |
| Freeze account | `AccountFrozen` | Authority, target account |
| Thaw account | `AccountThawed` | Authority, target account |
| Pause operations | `ProgramPaused` | Pauser identity |
| Unpause operations | `ProgramUnpaused` | Pauser identity |
| Blacklist address | `BlacklistAdded` | Blocked address, reason, blacklisted_by |
| Remove from blacklist | `BlacklistRemoved` | Unblocked address, removed_by |
| Seize tokens | `TokensSeized` | From account, amount, seized_by |
| Update roles | `RoleUpdated` | Role, old holder, new holder, updated_by |
| Update minter | `MinterUpdated` | Minter, is_active, quota, updated_by |
| Transfer authority | `AuthorityTransferred` | Old authority, new authority |

Events are indexed by Solana transaction logs and can be parsed using the SDK's `parseTransactionEvents` utility. AuditLogEntry PDAs provide a second, on-chain-queryable record.

### Circuit Breaker (Pause)

**Requirement:** Issuers should have the ability to halt operations in emergency situations (smart contract vulnerability, market crisis, regulatory order).

**SSS-2 Implementation:**

| SSS-2 Feature | Emergency Purpose |
|----------------|-----------------|
| `pause` | Immediately halt all mint and burn operations |
| `unpause` | Resume operations after the emergency is resolved |
| Dedicated pauser role | Operations team can pause without master authority access |
| `ProgramPaused` event | On-chain record of when and by whom the pause was initiated |

When paused, `mint_tokens` and `burn_tokens` revert with `ProgramPaused`. Existing token transfers continue to function (transfers are not paused, only supply operations). Freeze/thaw and blacklist operations remain available during a pause.

## OFAC Screening Workflow

### Pre-Mint Screening

Before minting tokens to a new recipient, the issuer should screen the recipient address:

```
1. Recipient submits KYC/KYB documentation
       |
       v
2. Screen recipient's identity against OFAC SDN list
   (off-chain compliance system)
       |
       v
3a. PASS --> Proceed to mint
3b. FAIL --> Reject mint request, do not create token account
       |
       v
4. Record screening result in internal compliance database
   (off-chain, linked to on-chain address)
```

### Ongoing Monitoring

```
1. Monitor OFAC SDN list updates (daily)
       |
       v
2. Cross-reference updated SDN entries against known
   on-chain addresses in the compliance database
       |
       v
3. For each newly sanctioned address:
   a. Call blacklist_add with reason "OFAC SDN - [entry ID]"
   b. Account is automatically frozen
   c. Transfer hook blocks all future transfers
       |
       v
4. If seizure is ordered:
   a. Obtain and document legal authority (court order)
   b. Call seize to recover tokens to treasury
   c. Record court order reference in internal system
```

### De-Listing

```
1. OFAC removes address from SDN list, or
   legal counsel determines blacklisting was erroneous
       |
       v
2. Verify removal through official OFAC channels
       |
       v
3. Call blacklist_remove for the address
   Account is automatically thawed
       |
       v
4. Record de-listing in compliance database
```

## Attestation Schedule

### Recommended Cadence

| Frequency | Attestation Type | Content |
|-----------|-----------------|---------|
| Monthly | Standard attestation | Third-party audit of reserve composition, total reserves vs. outstanding supply |
| Quarterly | Comprehensive attestation | Full reserve audit with detailed breakdown by asset class, custodian verification |
| Ad-hoc | Triggered attestation | Required after significant mint/burn events (>10% supply change), market disruptions, or regulatory requests |

### Attestation Process

```
1. Engage third-party auditor to examine reserves
       |
       v
2. Auditor produces reserve proof document
   (PDF with reserve composition, bank statements,
    treasury holdings, custodian confirmations)
       |
       v
3. Compute SHA-256 hash of the document
   sdk: OracleModule.computeReserveHash(documentBuffer)
       |
       v
4. Publish document at a stable URI
   (e.g., https://issuer.com/audits/2026-03.pdf)
       |
       v
5. Submit on-chain attestation:
   sss attest \
     --mint <MINT> \
     --hash <SHA256_HEX> \
     --reserves-usd <TOTAL_CENTS> \
     --outstanding <SUPPLY_BASE_UNITS> \
     --uri "https://issuer.com/audits/2026-03.pdf"
       |
       v
6. Announce attestation to token holders
   (verify at: ReserveAttestation PDA index N)
```

### Using the Oracle Module

The SDK's `OracleModule` can assist with attestation preparation:

```typescript
const oracle = new OracleModule(connection);

const reserveData = await oracle.buildReserveData({
  reserveComponents: [
    { name: "US Treasury Bills", amountUsd: 800_000_00 },  // $800,000 in cents
    { name: "FDIC-Insured Deposits", amountUsd: 200_000_00 },
  ],
  outstandingSupply: new BN(1_000_000_000_000),  // 1M tokens at 6 decimals
  attestationUri: "https://issuer.com/audits/2026-03.pdf",
});

await client.attestReserve(mint, {
  reserveHash: reserveData.reserveHash,
  totalReservesUsd: reserveData.totalReservesUsd,
  totalOutstanding: reserveData.totalOutstanding,
  attestationUri: reserveData.attestationUri,
});
```

## Role Separation for Regulatory Duties

Proper role separation is critical for compliance. Each role should be held by a different keypair, ideally managed by different individuals or teams.

### Recommended Role Assignment

| Role | Responsible Party | Keypair Type | Purpose |
|------|------------------|-------------|---------|
| Master Authority | CEO / Board / Multisig | Cold wallet or multisig | Root admin, authority transfer, role assignment, attestation |
| Pauser | Operations team | Hot wallet (monitored) | Emergency pause/unpause, individual freeze/thaw |
| Blacklister | Compliance officer | Hot wallet (audited) | OFAC screening, blacklist management |
| Seizer | Legal / compliance | Cold wallet or multisig | Asset seizure (requires documented legal authority) |
| Minter(s) | Treasury operations | Hot wallet (rate-limited by quota) | Day-to-day minting within assigned quotas |

### Key Principles

1. **Least privilege.** Each role should only have the permissions necessary for its function. The blacklister should not be able to seize. The pauser should not be able to blacklist.

2. **Separation of concerns.** The person who blacklists an address should not be the same person who seizes tokens from it. This creates an internal check on power.

3. **Master authority should be cold.** The master authority can do anything. It should be stored offline or behind a multisig, used only for role changes, authority transfers, and attestations.

4. **Minter quotas as guardrails.** Even trusted minters should have quotas. A compromised minter key with a 10M quota limits damage to 10M tokens. Quotas should be reviewed and adjusted regularly.

5. **Audit everything.** Every role action is recorded in the on-chain audit log. Internal compliance systems should also maintain off-chain records with additional context (court order numbers, SDN entry IDs, approval chains).

### Post-Deployment Checklist

After deploying an SSS-2 mint:

- [ ] Transfer pauser role to dedicated operations keypair
- [ ] Transfer blacklister role to dedicated compliance keypair
- [ ] Transfer seizer role to dedicated legal/compliance keypair
- [ ] Configure at least one minter with an appropriate quota
- [ ] Verify ExtraAccountMetaList is initialized (test a transfer)
- [ ] Transfer master authority to cold wallet or multisig
- [ ] Submit initial reserve attestation
- [ ] Configure event monitoring / indexer for audit trail

## Compliance Checklist

### Operational Compliance

- [ ] KYC/KYB procedures documented for all token account holders
- [ ] OFAC SDN screening integrated into onboarding flow
- [ ] Daily SDN list monitoring process in place
- [ ] Blacklist response SLA defined (e.g., within 4 hours of SDN update)
- [ ] Seizure requires documented legal authority (court order reference)
- [ ] All role assignments documented with responsible parties
- [ ] Minter quotas reviewed monthly

### Reserve Compliance

- [ ] Reserve assets held in segregated, auditable accounts
- [ ] Third-party auditor engaged for monthly attestations
- [ ] Attestation publication process documented
- [ ] Reserve composition meets GENIUS Act asset requirements (US Treasuries, FDIC-insured deposits, etc.)
- [ ] On-chain attestation submitted within 5 business days of audit completion
- [ ] Historical attestation records maintained and publicly accessible

### Technical Compliance

- [ ] Master authority stored in cold wallet or multisig
- [ ] All role keypairs secured with appropriate access controls
- [ ] Event indexer running for complete audit trail
- [ ] Incident response runbook documented (see [OPERATIONS.md](OPERATIONS.md))
- [ ] Key rotation procedures documented and tested
- [ ] Backup keypairs stored in geographically distributed secure locations

### Reporting

- [ ] Monthly reserve attestation published on-chain
- [ ] Quarterly comprehensive audit report submitted
- [ ] Annual compliance review with legal counsel
- [ ] Suspicious activity reports filed as required (off-chain, per FinCEN BSA requirements)
