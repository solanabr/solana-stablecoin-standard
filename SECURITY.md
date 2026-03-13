# Security Policy

## Supported Versions

We release security updates for the following versions:

| Version | Supported          |
| ------- | ------------------ |
| 0.1.x   | :white_check_mark: |
| < 0.1   | :x:                |

## Reporting a Vulnerability

We take security seriously. If you believe you have discovered a security vulnerability, please report it responsibly.

### Responsible Disclosure Process

1. **Do not** open a public GitHub issue for security vulnerabilities.

2. **Report privately** by creating a [GitHub Security Advisory](https://github.com/solanabr/solana-stablecoin-standard/security/advisories/new) or by emailing the maintainers through the contact information below.

3. **Include** in your report:
   - Description of the vulnerability and affected components
   - Steps to reproduce
   - Potential impact and attack scenario
   - Suggested fix (if any)

4. **Allow reasonable time** for maintainers to assess and respond before any public disclosure (typically 90 days).

5. **Coordinate disclosure**: We will work with you to acknowledge your report, confirm the issue, and develop a fix. We credit researchers in advisories when permitted.

### What to Expect

- **Acknowledgement**: We aim to acknowledge receipt within 48 hours.
- **Assessment**: We will triage and assess the report within 7 days.
- **Updates**: We will keep you informed of our progress and timeline.

## Known Limitations

- **Smart contract risk**: On-chain programs handle financial operations. Audits are recommended before mainnet deployment. This codebase has not undergone a formal third-party security audit.
- **Key management**: Private keys and wallet security are the responsibility of deployers and users. Use hardware wallets and secure key storage for production.
- **Upgrade authority**: Programs may be upgradeable. Ensure upgrade authority is properly managed and consider timelocks or multisig for production.
- **Oracle and external inputs**: Integration with external systems (oracles, compliance providers) introduces additional trust assumptions.

## Contact

- **Security issues**: [Open a GitHub issue](https://github.com/solanabr/solana-stablecoin-standard/issues) (use private draft for sensitive reports where possible)
- **GitHub Security Advisories**: [solana-stablecoin-standard/security](https://github.com/solanabr/solana-stablecoin-standard/security)

Thank you for helping keep Solana Stablecoin Standard and its users safe.
