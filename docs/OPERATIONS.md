# Operations Guide

## Overview

This guide covers day-to-day operations for managing a stablecoin using the Solana Stablecoin Standard.

## Initial Setup

### 1. Deploy Programs

```bash
# Set cluster
solana config set --url mainnet-beta

# Deploy programs
anchor deploy --provider.cluster mainnet

# Note the program IDs
```

### 2. Initialize Stablecoin

```bash
sss-token init --preset sss-2 \
  --name "Production USD" \
  --symbol "PUSD" \
  --decimals 6 \
  --cluster mainnet
```

### 3. Configure Roles

```bash
# Add minters
sss-token role add-minter <minter-address> --quota 1000000

# Add burners
sss-token role add-burner <burner-address>

# Add compliance officers
sss-token role add-blacklister <compliance-address>
```

## Daily Operations

### Minting Tokens

**Process:**
1. Verify fiat deposit received
2. Mint equivalent tokens
3. Send to recipient
4. Record transaction

```bash
# Mint 1000 PUSD
sss-token mint <recipient> 1000000000 \
  --minter <minter-keypair>
```

**Monitoring:**
```bash
# Check minter quota
sss-token minter-info <minter-address>

# Check total supply
sss-token supply
```

### Burning Tokens

**Process:**
1. Receive burn request
2. Verify token ownership
3. Burn tokens
4. Process fiat withdrawal
5. Record transaction

```bash
# Burn 1000 PUSD
sss-token burn 1000000000 \
  --burner <burner-keypair>
```

## Compliance Operations (SSS-2)

### Blacklist Management

**Adding to Blacklist:**

```bash
# Add address
sss-token blacklist add <address> \
  --reason "OFAC sanctions match" \
  --blacklister <compliance-keypair>

# Verify
sss-token blacklist list
```

**Removing from Blacklist:**

```bash
# Remove address
sss-token blacklist remove <address> \
  --blacklister <compliance-keypair>
```

### Account Freezing

**Freeze Account:**

```bash
# Freeze suspicious account
sss-token freeze <address> \
  --authority <authority-keypair>
```

**Seize Tokens:**

```bash
# Seize tokens from frozen account
sss-token seize <frozen-address> \
  --to <treasury-address> \
  --seizer <seizer-keypair>
```

**Thaw Account:**

```bash
# Unfreeze after investigation
sss-token thaw <address> \
  --authority <authority-keypair>
```

## Emergency Procedures

### Circuit Breaker (Pause)

**When to Use:**
- Security incident detected
- Smart contract vulnerability
- Regulatory requirement
- System maintenance

**Pause Operations:**

```bash
# Pause all operations
sss-token pause --pauser <pauser-keypair>

# Verify
sss-token status
```

**Resume Operations:**

```bash
# Resume after issue resolved
sss-token unpause --pauser <pauser-keypair>
```

### Authority Transfer

**Multi-sig Ceremony:**

```bash
# Transfer to new authority
sss-token transfer-authority <new-authority> \
  --current-authority <current-keypair>
```

## Monitoring

### Key Metrics

```bash
# Total supply
sss-token supply

# Stablecoin status
sss-token status

# Minter quotas
sss-token minter-info <minter>

# Blacklist size
sss-token blacklist list | wc -l
```

### Alerts

Set up monitoring for:
- Large mints/burns (>$100k)
- Quota near limit (>80%)
- Blacklist additions
- Pause events
- Authority changes

### Audit Trail

All operations are logged on-chain:

```bash
# Query recent events
solana logs <mint-address>

# Export audit log
sss-token audit-log --export audit.csv
```

## Backup & Recovery

### Key Management

**Hot Wallets (Operational):**
- Minters: Daily quota limits
- Burners: No special limits
- Stored in secure key management system

**Cold Storage (Critical):**
- Master authority: Multi-sig (3-of-5)
- Compliance officers: Hardware wallets
- Emergency pausers: Hardware wallets

**Backup Procedure:**
1. Generate keys offline
2. Encrypt with strong passphrase
3. Store in multiple secure locations
4. Test recovery quarterly

### Disaster Recovery

**Scenario: Lost Minter Key**

1. Pause operations (if needed)
2. Generate new minter keypair
3. Add new minter with role command
4. Remove old minter
5. Resume operations

**Scenario: Compromised Authority**

1. Immediately pause operations
2. Transfer authority to backup multi-sig
3. Investigate breach
4. Rotate all keys
5. Resume with new keys

## Best Practices

### Security

- ✅ Use multi-sig for master authority
- ✅ Implement daily minting quotas
- ✅ Regular security audits
- ✅ Monitor all operations
- ✅ Test disaster recovery procedures

### Compliance

- ✅ Screen all recipients
- ✅ Maintain audit trail
- ✅ Regular compliance reviews
- ✅ Document all blacklist actions
- ✅ Respond to regulatory requests promptly

### Operations

- ✅ Automate routine tasks
- ✅ Monitor key metrics
- ✅ Set up alerts
- ✅ Document procedures
- ✅ Train backup operators

## Troubleshooting

### Mint Fails: "Quota Exceeded"

```bash
# Check current quota
sss-token minter-info <minter>

# Wait for daily reset or increase quota
sss-token role update-minter <minter> --quota 2000000
```

### Transfer Fails: "Recipient Blacklisted"

```bash
# Check blacklist status
sss-token blacklist list | grep <address>

# If false positive, remove from blacklist
sss-token blacklist remove <address>
```

### Operations Paused

```bash
# Check status
sss-token status

# If authorized, unpause
sss-token unpause --pauser <pauser-keypair>
```

## Support

For operational issues:
- Check documentation: `/docs`
- Review audit logs: `sss-token audit-log`
- Contact support: support@example.com
- Emergency: emergency@example.com

## Appendix

### Role Permissions Matrix

| Role | Mint | Burn | Freeze | Blacklist | Seize | Pause |
|------|------|------|--------|-----------|-------|-------|
| Master Authority | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Minter | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Burner | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Blacklister | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ |
| Seizer | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ |
| Pauser | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |

### Compliance Checklist

- [ ] KYC/AML procedures documented
- [ ] Sanctions screening enabled
- [ ] Audit trail maintained
- [ ] Incident response plan
- [ ] Regular compliance reviews
- [ ] Regulatory reporting setup
