# Security Policy

## Reporting Vulnerabilities

If you discover a security vulnerability in the Solana Stablecoin Standard, please report it responsibly.

**Email:** security@sss.dev

Please include:
- Description of the vulnerability
- Steps to reproduce
- Potential impact assessment
- Suggested fix (if any)

We aim to respond within 48 hours and will coordinate disclosure timelines with you.

## Scope

The following components are in scope:

| Component | Program ID |
|-----------|------------|
| sss-core | `G3jadBDzaF2HbTY2at5auYYQQ94zhhWaocMuWDgUy2vL` |
| sss-transfer-hook | `EAzHNW2cjpYdBjLBJ9RVLoGryXQJE98dpHTdyPiE6389` |

## Security Measures

### On-Chain

- **Role-based access control**: Six roles with separation of duties
- **Fail-closed transfer hook**: Blocks transfers if config is unreadable
- **Two-step authority transfer**: Prevents accidental authority loss
- **Quota enforcement**: Per-minter mint limits
- **Pause mechanism**: Global emergency stop

### Testing

- 203 integration tests across 11 test suites
- 3 dedicated security test suites (authority escalation, blacklist bypass, overflow)
- Invariant-based fuzz testing (50,000 randomized operations)
- 39 devnet smoke test transactions

### Design Principles

1. PDA-based roles: No central registry, no enumeration attacks
2. Permanent delegate restricted to program CPI only
3. Blacklist enforcement at transfer level (inescapable)
4. All operations emit events for audit trail
5. Reserved fields in all accounts for upgrade compatibility
