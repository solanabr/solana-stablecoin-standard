# Operations Runbook

This runbook guides protocol operators using the `sss-token` CLI. 

## Initialization Config
Before acting, operators must initialize the token using the SSS standard they plan to adopt.
```bash
sss-token init --preset sss-2
```

## General Token Operations
Requires the `Minter` or `Burner` roles respectively.

### Minting
```bash
sss-token mint <recipient-pubkey> 1000000 
```

### Burning
```bash
sss-token burn 500000
```

## Compliance and Halting Operations

### Freezing (SSS-1 & SSS-2)
```bash
sss-token freeze <address>
```
If an exploit is suspected globally:
```bash
sss-token pause
```

### Advanced Compliance (SSS-2 Only)
Adding an address to the transfer hook blocklist:
```bash
sss-token blacklist add <address> --reason "Compliance request: Sanction matched"
```

To seize funds from that user explicitly using the permanent delegate:
```bash
sss-token seize <address> --to <treasury-address>
```
