---
sidebar_position: 6
title: Compliance and Security
description: Governance, enforcement, and security controls for production SSS
---

# Compliance and Security

This guide defines the minimum control set expected for production-grade SSS deployments.

## Core Controls

- Segregated operator roles for issuance, compliance, and emergency response.
- Two-step authority transfer for governance safety.
- Quota-based mint controls for blast radius reduction.
- Freeze and pause runbooks with explicit approval paths.

## Compliance Workflows

### Freeze and Thaw

Use account freeze as a temporary investigative control. Every freeze must include:

- Incident reference ID
- Approver identity
- Start timestamp and review window

### Blacklist Lifecycle (SSS-2 and SSS-3)

Blacklist actions should map to a policy reason code and include:

- Trigger source (sanctions screening, legal order, fraud signal)
- Approver and executor identities
- Removal criteria and periodic review schedule

### Seizure Controls (where legally permitted)

Seizure should require dual authorization and immutable audit evidence.

## Security Posture

Production recommendations:

- Multisig authority custody
- Dedicated signing infrastructure
- Isolated CI/CD pipeline for program artifacts
- Continuous monitoring for admin actions and large supply changes

## Minimum Audit Evidence

Maintain auditable records for:

- Role changes
- Authority nominations and acceptance
- Mint and burn operations
- Freeze, blacklist, seizure, pause, and unpause actions

## Incident Response

Define severity tiers and response SLAs before launch:

- P1: protocol compromise or unauthorized mint risk
- P2: compliance-policy bypass or transfer-policy failure
- P3: degraded service without safety impact

## Next Step

Use [Operations Runbook](./operations-runbook) to operationalize these controls.
