# Security Considerations

## Threat Model

### Assets

| Asset | Value | Protection Mechanism |
|-------|-------|---------------------|
| Stablecoin Supply | Economic value | Mint quotas, role-based access |
| User Funds | User holdings | Freeze/thaw, blacklist (SSS-2) |
| Configuration | Operational control | Master authority, role separation |
| Compliance Records | Regulatory evidence | On-chain audit trail |

### Threat Actors

| Actor | Motivation | Capabilities |
|-------|-----------|--------------|
| External Attacker | Steal funds, disrupt operations | Network access, no keys |
| Compromised Minter | Unauthorized minting | Minter key only |
| Compromised Admin | Control takeover | Master or role key |
| Malicious User | Bypass restrictions | User wallet |

## Attack Vectors and Mitigations

### 1. Unauthorized Minting

**Attack**: Compromised minter key mints unlimited tokens.

**Mitigations**:
- Time-window quotas per minter
- Multiple minters with individual limits
- Master authority can revoke minter access
- Events emitted for all mints (audit trail)

**Code Reference**:
```rust
// Quota enforcement in mint instruction
require!(minter_role.active, StablecoinError::Unauthorized);
update_quota(minter_role, amount)?;
```

### 2. Inflation Attack

**Attack**: Manipulate token supply to devalue holdings.

**Mitigations**:
- All mint operations require minter role
- No privileged mint to arbitrary addresses
- Supply changes are logged on-chain

### 3. Pause Bypass

**Attack**: Continue operations while protocol is paused.

**Mitigations**:
- Pause check in mint, burn, freeze instructions
- Transfer hook also checks pause status (SSS-2)
- Only pauser role can unpause

**Code Reference**:
```rust
require!(!config.paused, StablecoinError::Paused);
```

### 4. Role Escalation

**Attack**: Gain unauthorized access to privileged operations.

**Mitigations**:
- Strict role separation (master, pauser, burner, blacklister, seizer)
- Each role checked independently
- Master authority required for role changes

### 5. Compliance Bypass (SSS-2)

**Attack**: Transfer tokens while blacklisted.

**Mitigations**:
- Transfer hook validates both source and destination
- Seize path is allowlisted for authorized seizures only
- Compliance records are immutable PDAs

### 6. Reentrancy

**Attack**: Re-enter during CPI calls.

**Mitigations**:
- All state changes occur before CPI
- No external calls before state updates
- Simple instruction flow

### 7. PDA Collision

**Attack**: Find collision in PDA derivation.

**Mitigations**:
- Deterministic seeds with unique elements
- Config PDA: `["config", mint]`
- Minter role PDA: `["minter", config, authority]`
- Compliance record PDA: `["compliance", mint, wallet]`

### 8. Integer Overflow

**Attack**: Exploit arithmetic overflow.

**Mitigations**:
- Checked arithmetic with `checked_add`
- Explicit overflow errors
- Reasonable bounds on quotas (u64)

## Security Best Practices

### Key Management

1. **Multi-signature**: Use multisig for master authority
2. **Hardware wallets**: Store role keys in HSMs
3. **Key rotation**: Regular rotation of operational roles
4. **Separation**: Master key distinct from operational keys

### Operational Security

1. **Monitoring**: Index all events for real-time monitoring
2. **Alerting**: Set up alerts for large mints, pauses
3. **Audit**: Regular review of role assignments
4. **Incident Response**: Documented procedures for key compromise

### Smart Contract Security

1. **Upgrade Path**: Programs are immutable - plan for migration
2. **Testing**: Comprehensive test coverage (see TESTING.md)
3. **Audit**: Recommend third-party audit before mainnet
4. **Bug Bounty**: Consider bug bounty program

## Emergency Procedures

### Key Compromise Response

| Compromised Key | Immediate Action | Recovery |
|-----------------|-----------------|----------|
| Minter | Revoke via `update_minter` | Issue new minter role |
| Pauser | Transfer to new pauser | Update roles |
| Blacklister | Transfer to new blacklister | Update roles |
| Master | Use remaining keys to transfer authority | Transfer to new master |

### Pause Scenarios

**Pause Immediately**:
- Suspected unauthorized minting
- Transfer hook anomalies
- Compliance system compromise

**Post-Pause Actions**:
1. Investigate cause
2. Freeze affected accounts if needed
3. Blacklist malicious actors (SSS-2)
4. Prepare fix or authority rotation
5. Unpause when safe

## Audit Checklist

### Pre-Deployment

- [ ] All instructions have proper access control
- [ ] Quota math handles overflow correctly
- [ ] Pause state is checked in all sensitive operations
- [ ] PDA derivation is deterministic
- [ ] Events are emitted for all state changes
- [ ] Compliance checks are bypass-proof (SSS-2)
- [ ] Transfer hook validates all accounts (SSS-2)

### Post-Deployment

- [ ] Program IDs recorded and verified
- [ ] Authority keys secured
- [ ] Monitoring infrastructure in place
- [ ] Incident response plan documented
- [ ] Team trained on emergency procedures

## Disclosure Policy

Report security vulnerabilities to:
- GitHub Security Advisory
- Email: [your security contact]

Please include:
- Description of vulnerability
- Steps to reproduce
- Suggested fix (if any)
- Impact assessment

## References

- [Anchor Security Best Practices](https://book.anchor-lang.com/)
- [Solana Program Security](https://docs.solana.com/developing/programming-model/security)
- [Token-2022 Security](https://spl.solana.com/token-2022/security)
