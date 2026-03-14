---
sidebar_position: 4
title: Architecture
description: System architecture and control planes in SSS
---

# Architecture

SSS separates issuance policy, transfer policy, and operator interfaces into clear control planes.

## Components

- `sss-token`: core program for mint policy, governance, roles, and compliance actions.
- `sss-transfer-hook`: transfer gate that enforces policy checks during token movement.
- `@sss/sdk`: typed integration library for app/backend development.
- `@sss/cli`: operational interface for issuing and compliance workflows.

## Data and Control Model

- **Mint-level policy**: supply cap, pause state, authority lifecycle.
- **Role-level policy**: operator permissions for minting and compliance actions.
- **Address-level policy**: blacklist and freeze controls.
- **Oracle-level policy**: optional pricing and reserve verification logic.

## Program-Derived Accounts

Key PDA families:

- Config PDA (`config + mint`)
- Roles PDA (`roles + config + user`)
- Blacklist PDA (`blacklist + config + address`)
- Oracle PDA (`oracle + config`)

## Authority Model

SSS uses two-step authority handoff:

1. Current authority nominates a new authority.
2. New authority explicitly accepts.

This prevents accidental or malicious unilateral transfer.

## Operational Architecture

For production, run a three-tier service model:

- API/backend for signed operator workflows and observability.
- Frontend for operator UX and access control.
- Documentation and policy portal for runbooks and audit evidence.

## Next Step

See [Token Standards](./token-standards) for capability selection and rollout strategy.
