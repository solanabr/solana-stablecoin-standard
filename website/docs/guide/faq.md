---
sidebar_position: 11
title: FAQ
description: Frequently asked questions for SSS teams
---

# FAQ

## Is SSS suitable for production?

SSS is designed for production-oriented teams, but your readiness depends on deployment controls, key custody, compliance workflows, and operational maturity.

## Which standard should we choose?

- Choose `SSS-1` for controlled internal pilots.
- Choose `SSS-2` for regulated issuance requiring transfer policy enforcement.
- Choose `SSS-3` for privacy-sensitive programs with governance requirements.

## Can we change the standard later?

Treat standard selection as launch-time architecture. If requirements change, plan controlled migration to a new mint.

## How should we manage authority keys?

Use multisig or managed custody in production. Avoid single hot-wallet authority for issuance and emergency controls.

## How do we integrate with backend services?

Use the SDK for transaction-building logic and policy checks in your application services, then enforce approval and audit logging before signing.

## How should compliance actions be audited?

Every freeze, blacklist, seizure, and pause action should include reason code, operator identity, approver identity, and case reference.

## Where should operators start?

Start with:

1. [Getting Started](./getting-started)
2. [Quickstart](./quickstart)
3. [SDK and CLI](./sdk-cli)
4. [Deployment](./deployment)
5. [Operations Runbook](./operations-runbook)
