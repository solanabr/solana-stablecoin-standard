---
sidebar_position: 7
title: SDK and CLI
description: Integration and operator workflows with @sss/sdk and @sss/cli
---

# SDK and CLI

SSS exposes two primary interfaces:

- `@sss/sdk`: application and backend integration
- `@sss/cli`: operator and automation execution

## SDK Essentials

Install SDK:

```bash
npm install @sss/sdk
```

Initialize client:

```ts
import { SSSClient } from '@sss/sdk';
const client = new SSSClient(connection, authorityPubkey);
```

Common operations:

- `initialize`
- `updateRoles`
- `updateMinterConfig`
- `mintTokens` / `burnTokens`
- `freezeAccount` / `thawAccount`
- `addToBlacklist` / `removeFromBlacklist`
- `pause` / `unpause`

## CLI Essentials

Install CLI:

```bash
npm install -g @sss/cli
```

Core commands:

```bash
sss --help
sss config show
sss init --name "Example USD" --symbol xUSD --preset sss2
sss mint --config <CONFIG_PDA> --amount <AMOUNT> --recipient <PUBKEY>
```

## Automation Guidance

Use CLI for repeatable operations in scheduled jobs and use SDK for service-level business logic.

Recommended pattern:

- API layer validates policy and authorization.
- Signing layer executes whitelisted operations.
- Audit layer records action metadata.

## Integration Checklist

- Pin package versions for deterministic builds.
- Validate cluster and program IDs at startup.
- Enforce idempotency for mint and compliance actions.
- Emit structured logs with correlation IDs.

## Next Step

Continue to [Instructions Reference](./instructions-reference).
