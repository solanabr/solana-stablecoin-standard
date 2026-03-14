# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 1.x.x   | :white_check_mark: |
| < 1.0   | :x:                |

## Reporting a Vulnerability

We take security vulnerabilities seriously. If you discover a security issue, please report it responsibly.

### How to Report

**DO NOT** create a public GitHub issue for security vulnerabilities.

Instead, please report security vulnerabilities via one of these methods:

1. **Email**: security@example.com (replace with actual email)
2. **GitHub Security Advisories**: Use the "Security" tab in this repository

### What to Include

Please include the following in your report:

- A clear description of the vulnerability
- Steps to reproduce the issue
- Potential impact assessment
- Any suggested fixes (if available)

### Response Timeline

- **Initial Response**: Within 48 hours
- **Status Update**: Within 7 days
- **Resolution Target**: Within 30 days (depending on severity)

### Severity Classification

| Severity | Description | Response Time |
|----------|-------------|---------------|
| Critical | Complete compromise of funds or authority | Immediate |
| High | Significant financial impact possible | 24 hours |
| Medium | Limited impact or requires unlikely conditions | 7 days |
| Low | Minimal impact | 30 days |

## Security Measures

### On-Chain Security

This project implements several security measures:

1. **security.txt**: On-chain security disclosure via [security-txt](https://github.com/neodyme-labs/solana-security-txt)
2. **Two-Step Authority Transfer**: Prevents accidental authority transfers
3. **Role-Based Access Control**: Granular permissions with audit trails
4. **Per-Minter Quotas**: Limits potential damage from compromised minters
5. **Pause Mechanism**: Emergency stop for all operations

### Development Security

- All dependencies are regularly audited
- Cargo audit runs in CI
- Fuzz testing for critical paths
- Code review required for all changes

## Bug Bounty

We are considering establishing a bug bounty program. Details will be announced here.

### Scope

In scope:
- Smart contract vulnerabilities
- Economic exploits
- Access control bypasses
- Cryptographic issues

Out of scope:
- Frontend/UI issues
- Social engineering
- Denial of service (unless permanent)
- Issues in dependencies (report upstream)

## Acknowledgments

We thank the following security researchers for responsible disclosure:

- (None yet - be the first!)

## Contact

For security-related inquiries:
- Email: security@example.com
- PGP Key: (to be added)
