---
sidebar_position: 5
title: Token Standards
description: SSS-1, SSS-2, and SSS-3 profiles and selection guidance
---

# Token Standards

SSS defines three standards so teams can align feature depth with regulatory and business requirements.

## SSS-1

Use `SSS-1` when you need controlled issuance with minimal compliance complexity.

Typical profile:

- Core token administration
- Role-based mint controls
- Pause and freeze controls
- No transfer-hook blacklist enforcement

## SSS-2

Use `SSS-2` for regulated fiat-backed deployments that require policy enforcement during transfers.

Typical profile:

- Includes all SSS-1 controls
- Transfer-hook enforcement
- Blacklist and seizure workflows
- Strong separation of operator duties

## SSS-3

Use `SSS-3` for advanced privacy-sensitive deployments that still require policy and governance controls.

Typical profile:

- Includes all SSS-2 controls
- Confidential transfer-oriented feature set
- Additional operational complexity and audit requirements

## Selection Guide

Choose based on the strongest requirement in your target environment:

- Internal pilot or closed ecosystem: `SSS-1`
- Regulated issuance with sanctions controls: `SSS-2`
- Privacy-driven issuance with compliance oversight: `SSS-3`

## Migration Strategy

Treat standard selection as immutable at launch for predictable controls. If a profile change is required, plan a controlled migration to a new mint with explicit user migration windows.

## Next Step

Continue with [Compliance and Security](./compliance-security).
