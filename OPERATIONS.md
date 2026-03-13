# Operations Runbook

## Prerequisites

- Operator key has required roles.
- RPC endpoint is healthy.
- Mint is initialized and configured.

## Core Operator Actions

### Mint

```bash
sss-token --rpc-url <RPC> --keypair <KEYPAIR> --mint <MINT> mint <RECIPIENT> <AMOUNT>
```

### Freeze / Thaw

```bash
sss-token ... freeze <TOKEN_ACCOUNT>
sss-token ... thaw <TOKEN_ACCOUNT>
```

### Pause / Unpause (SSS-2)

```bash
sss-token ... pause
sss-token ... unpause
```

### Blacklist Management (SSS-2)

```bash
sss-token ... blacklist add <WALLET> --reason "reason"
sss-token ... blacklist remove <WALLET>
```

### Seize (SSS-2)

```bash
sss-token ... seize <FROM_ATA> --to <TREASURY_WALLET>
```

## Role Operations

```bash
sss-token ... update-roles --role burner --new-key <PUBKEY>
sss-token ... update-roles --role pauser --new-key <PUBKEY>
sss-token ... update-roles --role seizer --new-key <PUBKEY>
sss-token ... transfer-authority --new-master <PUBKEY>
```

## Incident Checklist

- Verify current mint status (`sss-token ... status`).
- Snapshot balances and holder set (`holders`, `supply`).
- Execute emergency controls (pause/freeze/blacklist) if needed.
- Export and archive audit logs.
