---
sidebar_position: 1
title: Introduction
description: Official overview of the Solana Stablecoin Standard
---

# Solana Stablecoin Standard

The Solana Stablecoin Standard (SSS) is a framework for launching and operating regulated stablecoins on Solana using Token-2022.

This documentation is structured for teams that need to go from initial setup to production operations.

## What SSS Provides

- A standards model with three profiles (`SSS-1`, `SSS-2`, `SSS-3`) to match compliance and privacy requirements.
- On-chain administrative controls for issuance, role management, emergency response, and authority governance.
- Integration surfaces for SDK-based applications, operator CLI workflows, and backend automation.
- Operational guidance for deployment, monitoring, incident handling, and compliance execution.

## Architecture at a Glance

SSS is composed of:

- A core stablecoin program (`sss-token`) for policy and supply controls.
- A transfer validation program (`sss-transfer-hook`) for policy enforcement during transfers.
- A TypeScript SDK (`@sss/sdk`) and CLI (`@sss/cli`) for integration and operations.

For detailed architecture, continue to [Architecture](./architecture).

## Documentation Path

1. Start with [Getting Started](./getting-started) for environment setup and prerequisites.
2. Follow [Quickstart](./quickstart) to create your first stablecoin.
3. Learn [Token Standards](./token-standards) to select the right profile.
4. Implement using [SDK and CLI](./sdk-cli) and [Instructions Reference](./instructions-reference).
5. Move to [Deployment](./deployment) and [Operations Runbook](./operations-runbook).

## Scope and Assumptions

This documentation assumes your team understands:

- Solana accounts, programs, and transaction signing.
- Token-2022 extension concepts.
- Production controls for key management and incident response.

If you are new to Solana, complete the setup guide first.
