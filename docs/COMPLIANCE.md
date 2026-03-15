# Compliance Guide

## Overview

This guide covers the compliance features available in SSS-2 stablecoins, including blacklist management, asset seizure, and operational procedures for compliance officers.

## Compliance Officer Role

The ComplianceOfficer role can only be assigned by the master authority and is only functional on SSS-2 mints. Compliance officers can:

- Add addresses to the blacklist
- Remove addresses from the blacklist
- Seize tokens from blacklisted accounts
- Check blacklist status of any address

## Blacklist Management

### Adding to Blacklist

When an address is added to the blacklist, a `BlacklistEntry` PDA is created on-chain. The transfer hook checks for this PDA on every transfer.

```bash
# CLI
sss-token blacklist add --mint <MINT> --address <ADDRESS>

# SDK
await stable.compliance.addToBlacklist(address);
```

**Effect:** All transfers to or from the blacklisted address will be rejected immediately. Existing balances remain in place until seized.

### Removing from Blacklist

```bash
sss-token blacklist remove --mint <MINT> --address <ADDRESS>
```

**Effect:** The BlacklistEntry PDA is closed and rent is refunded. Transfers are immediately allowed again.

### Checking Status

```bash
sss-token blacklist check --mint <MINT> --address <ADDRESS>
```

## Asset Seizure

Seizure uses the permanent delegate authority to transfer tokens from a blacklisted account to a treasury account.

### Prerequisites

1. The source account owner must be blacklisted (BlacklistEntry PDA must exist)
2. The caller must have the ComplianceOfficer role
3. The mint must be SSS-2 (permanent delegate enabled)

### Process

```bash
sss-token seize \
  --mint <MINT> \
  --from <BLACKLISTED_ATA> \
  --to <TREASURY_ATA> \
  --amount <AMOUNT> \
  --owner <BLACKLISTED_WALLET>
```

### Audit Trail

All compliance operations emit program logs that are indexed by the event indexer service:

- `Address {addr} added to blacklist for mint {mint}`
- `Address {addr} removed from blacklist for mint {mint}`
- `Seized {amount} tokens from blacklisted address {addr} to {dest}`

## Best Practices

1. **Document all actions** — maintain off-chain records of why addresses were blacklisted
2. **Use separate compliance officer keys** — don't use the master authority for daily compliance operations
3. **Monitor the transfer hook** — failed transfers (blacklist rejections) generate logs
4. **Test on devnet first** — always verify blacklist/seize flows on devnet before mainnet
5. **Time-box blacklist entries** — regularly review and clean up stale blacklist entries

## Regulatory Considerations

The SSS-2 standard provides the *technical capability* for compliance but does not prescribe specific regulatory frameworks. Issuers should:

- Consult legal counsel on applicable regulations (e.g., OFAC, AML/KYC requirements)
- Implement off-chain identity verification before blacklist decisions
- Maintain proper documentation for all compliance actions
- Consider jurisdiction-specific requirements for asset seizure
