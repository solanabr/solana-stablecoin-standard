---
title: Compliance Features
description: How SSS maps to reserve attestation, sanctions controls, role separation, and issuer operations commonly discussed in U.S. stablecoin proposals.
---

# Compliance Features

SSS is not a legal wrapper. It is a set of on-chain controls that support issuer workflows typically discussed in regulated stablecoin frameworks.

## Regulatory Framing

The current docs are written against the technical themes present in the 2025 U.S. proposals commonly called:

- [GENIUS Act, S.1582](https://www.congress.gov/bill/119th-congress/senate-bill/1582)
- [STABLE Act, H.R.2392](https://www.congress.gov/bill/119th-congress/house-bill/2392)

Those proposals can change. Verify the current legal status and your jurisdiction-specific obligations before launch.

## Reserve Transparency

SSS exposes an on-chain reserve attestation primitive:

- immutable `ReserveAttestation` PDAs
- attestation hash storage
- reserve amount and outstanding-supply fields
- URI pointer to the underlying report

This supports:

- public proof that an attestation existed at a specific time
- audit workflows that compare outstanding supply with attested reserves
- off-chain report publication with on-chain hash anchoring

## Sanctions And Lawful-Order Controls

SSS-2 provides:

- per-wallet blacklist entries
- automatic freeze on blacklist add
- transfer-hook rejection for blacklisted senders and recipients
- seizure flow for blacklisted accounts through permanent delegate authority

This covers the mechanical side of:

- sanctions enforcement
- account restriction
- recovery or redeployment of funds under issuer policy or lawful order

It does not provide:

- screening lists
- KYC/KYB pipelines
- case management
- legal authorization workflows

## Role Separation

SSS separates:

- master authority
- pauser
- blacklister
- seizer
- minter wallets

That lets an issuer split responsibilities across operations, compliance, legal, and treasury teams instead of concentrating every power in one key.

## Emergency Response

The `pause`, `freeze`, and `thaw` paths give an issuer:

- mint and burn suspension during incidents
- targeted account controls
- continued access to compliance operations while mint and burn are paused

## Practical Compliance Mapping

| Need | SSS primitive |
| --- | --- |
| Reserve disclosure | `attest_reserve` and `ReserveAttestation` PDAs |
| Operational segregation | `RoleRegistry` plus minter-specific PDAs |
| Sanctions controls | `blacklist_add`, `blacklist_remove`, transfer hook |
| Asset recovery | `seize` using permanent delegate |
| Emergency halt | `pause` and `unpause` |
| Account-level restriction | `freeze_account` and `thaw_account` |

## Important Limitations In The Current Code

- `attest_reserve` records state but does not emit a dedicated event
- blacklist and seizure gating currently depend on `enablePermanentDelegate`
- `AuditLogEntry` is defined but not written
- no off-chain compliance workflow is bundled with the program itself

## Recommended Issuer Checklist

- separate keys for master authority, pauser, blacklister, and seizer
- document who is allowed to sign reserve attestations
- run screening off-chain before minting and during ongoing monitoring
- verify the transfer-hook setup immediately after SSS-2 initialization
- build an off-chain event and attestation indexer for reporting
