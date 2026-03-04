# Solana Stablecoin Standard (SSS)

> Production-ready SDK for creating institutional-grade stablecoins on Solana

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Solana](https://img.shields.io/badge/Solana-Token--2022-9945FF?logo=solana)](https://solana.com)
[![Anchor](https://img.shields.io/badge/Anchor-0.30-blueviolet)](https://www.anchor-lang.com/)

The Solana Stablecoin Standard is a modular SDK for creating, deploying, and managing stablecoins on Solana. Think OpenZeppelin for Solana stablecoins — production-ready templates that institutions and builders can fork, customize, and deploy.

---

## 🎯 Overview

The SSS provides three layers of abstraction:

**Layer 1 — Base SDK**: Token creation with configurable Token-2022 extensions  
**Layer 2 — Modules**: Composable compliance, privacy, and governance capabilities  
**Layer 3 — Standard Presets**: Opinionated configurations (SSS-1, SSS-2, SSS-3)

### Standard Presets

| Standard | Name | Use Case | Features |
|----------|------|----------|----------|
| **SSS-1** | Minimal Stablecoin | Internal tokens, DAO treasuries | Mint + Freeze + Metadata |
| **SSS-2** | Compliant Stablecoin | Regulated tokens (USDC-class) | SSS-1 + Blacklist + Seizure |
| **SSS-3** | Private Stablecoin | Privacy-focused (experimental) | SSS-1 + Confidential Transfers |

---

## 🚀 Quick Start

### Installation

```bash
# Install CLI globally
npm install -g @stbr/sss-token

# Or use npx
npx @stbr/sss-token init --preset sss-1
```

### Create Your First Stablecoin

```bash
# Initialize with SSS-1 preset (minimal)
sss-token init --preset sss-1 \
  --name "My Stablecoin" \
  --symbol "MYUSD" \
  --decimals 6

# Or SSS-2 preset (compliant)
sss-token init --preset sss-2 \
  --name "Compliant USD" \
  --symbol "CUSD" \
  --decimals 6

# Or custom configuration
sss-token init --custom config.toml
```

### Basic Operations

```bash
# Mint tokens
sss-token mint <recipient> <amount>

# Burn tokens
sss-token burn <amount>

# Freeze account
sss-token freeze <address>

# Check status
sss-token status
sss-token supply
```

### SSS-2 Compliance Operations

```bash
# Blacklist management
sss-token blacklist add <address> --reason "OFAC match"
sss-token blacklist remove <address>
sss-token blacklist list

# Seize tokens from frozen account
sss-token seize <address> --to <treasury>

# Audit trail
sss-token audit-log --action blacklist
sss-token audit-log --export audit.csv
```

---

## 📦 TypeScript SDK

### Installation

```bash
npm install @stbr/sss-token
```

### Usage

```typescript
import { SolanaStablecoin, Presets } from "@stbr/sss-token";
import { Connection, Keypair } from "@solana/web3.js";

const connection = new Connection("https://api.mainnet-beta.solana.com");
const authority = Keypair.fromSecretKey(/* your key */);

// Create with preset
const stable = await SolanaStablecoin.create(connection, {
  preset: Presets.SSS_2,
  name: "My Stablecoin",
  symbol: "MYUSD",
  decimals: 6,
  authority,
});

// Mint tokens
await stable.mint({
  recipient: recipientAddress,
  amount: 1_000_000, // 1 MYUSD (6 decimals)
  minter: minterKeypair,
});

// SSS-2: Compliance operations
await stable.compliance.blacklistAdd(
  suspiciousAddress,
  "Sanctions match"
);

await stable.compliance.seize(
  frozenAccount,
  treasuryAddress
);

// Query state
const supply = await stable.getTotalSupply();
const balance = await stable.getBalance(address);
const isBlacklisted = await stable.compliance.isBlacklisted(address);
```

### Custom Configuration

```typescript
// Full control over extensions
const custom = await SolanaStablecoin.create(connection, {
  name: "Custom Stable",
  symbol: "CUSD",
  decimals: 6,
  authority,
  extensions: {
    permanentDelegate: true,
    transferHook: true,
    confidentialTransfers: false,
    defaultAccountFrozen: false,
  },
  roles: {
    minters: [minter1.publicKey, minter2.publicKey],
    burners: [burner.publicKey],
    blacklisters: [compliance.publicKey],
  },
});
```

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    LAYER 3: PRESETS                     │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐             │
│  │  SSS-1   │  │  SSS-2   │  │  SSS-3   │             │
│  │ Minimal  │  │Compliant │  │ Private  │             │
│  └──────────┘  └──────────┘  └──────────┘             │
└─────────────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────────┐
│                   LAYER 2: MODULES                      │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐ │
│  │  Compliance  │  │   Privacy    │  │  Governance  │ │
│  │   Module     │  │   Module     │  │    Module    │ │
│  └──────────────┘  └──────────────┘  └──────────────┘ │
└─────────────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────────┐
│                   LAYER 1: BASE SDK                     │
│  ┌──────────────────────────────────────────────────┐  │
│  │         Token-2022 Core + Extensions             │  │
│  │  Mint • Burn • Freeze • Metadata • Roles         │  │
│  └──────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

### Components

**On-Chain Programs (Anchor/Rust)**
- `stablecoin-core`: Main program with role-based access control
- `transfer-hook`: Compliance checks on every transfer (SSS-2)
- `oracle-adapter`: Price feed integration (bonus)

**TypeScript SDK**
- `@stbr/sss-token`: Main SDK package
- `@stbr/sss-cli`: Command-line interface

**Backend Services**
- Mint/Burn service: Fiat-to-stablecoin lifecycle
- Event indexer: Monitor on-chain events
- Compliance service: Blacklist management, sanctions screening
- Webhook service: Configurable notifications

---

## 📚 Documentation

- [Architecture](./docs/ARCHITECTURE.md) - System design and data flows
- [SDK Reference](./docs/SDK.md) - TypeScript SDK documentation
- [Operations Guide](./docs/OPERATIONS.md) - Operator runbook
- [SSS-1 Specification](./docs/SSS-1.md) - Minimal stablecoin standard
- [SSS-2 Specification](./docs/SSS-2.md) - Compliant stablecoin standard
- [SSS-3 Specification](./docs/SSS-3.md) - Private stablecoin standard
- [Compliance Guide](./docs/COMPLIANCE.md) - Regulatory considerations
- [API Reference](./docs/API.md) - Backend API documentation

---

## 🔐 Security

### Role-Based Access Control

No single key controls everything. The SDK enforces separation of duties:

| Role | Permissions | Use Case |
|------|-------------|----------|
| **Master Authority** | Update roles, pause/unpause | Emergency control |
| **Minter** | Mint tokens (with quota) | Treasury operations |
| **Burner** | Burn tokens | Redemption operations |
| **Blacklister** | Add/remove from blacklist | Compliance officer |
| **Seizer** | Seize tokens from frozen accounts | Regulatory enforcement |
| **Pauser** | Pause/unpause all operations | Circuit breaker |

### Security Features

- ✅ Multi-sig support for all critical operations
- ✅ Per-minter quotas (daily/monthly limits)
- ✅ Time-locks for large operations
- ✅ Emergency pause functionality
- ✅ Immutable audit trail
- ✅ Transfer hooks for compliance checks
- ✅ Account freezing capability

### Audits

- [ ] Audit by [Firm Name] - Scheduled
- [ ] Bug bounty program - Coming soon

---

## 🧪 Testing

```bash
# Run all tests
npm test

# Unit tests
npm run test:unit

# Integration tests
npm run test:integration

# Fuzz tests (Trident)
npm run test:fuzz

# Test specific preset
npm run test:sss1
npm run test:sss2
```

### Test Coverage

- ✅ Unit tests for all instructions
- ✅ Integration tests per preset
- ✅ Fuzz tests for edge cases
- ✅ Stress tests on Devnet
- ✅ Security tests (access control, reentrancy)

---

## 🚢 Deployment

### Devnet

```bash
# Deploy programs
anchor deploy --provider.cluster devnet

# Initialize stablecoin
sss-token init --preset sss-2 \
  --cluster devnet \
  --name "Test USD" \
  --symbol "TUSD"
```

### Mainnet

```bash
# Deploy programs
anchor deploy --provider.cluster mainnet

# Initialize with multi-sig
sss-token init --preset sss-2 \
  --cluster mainnet \
  --name "Production USD" \
  --symbol "PUSD" \
  --multisig 3-of-5
```

---

## 📊 Comparison with Alternatives

| Feature | SSS | Circle USDC | Custom Token | Squads |
|---------|-----|-------------|--------------|--------|
| **Open Source** | ✅ | ❌ | ✅ | ✅ |
| **Modular** | ✅ | ❌ | ⚠️ | ❌ |
| **Compliance Built-in** | ✅ | ✅ | ❌ | ❌ |
| **Role-Based Access** | ✅ | ✅ | ⚠️ | ✅ |
| **Transfer Hooks** | ✅ | ✅ | ❌ | ❌ |
| **CLI Tool** | ✅ | ❌ | ❌ | ✅ |
| **TypeScript SDK** | ✅ | ✅ | ⚠️ | ✅ |
| **Backend Services** | ✅ | ✅ | ❌ | ❌ |
| **Documentation** | ✅ | ✅ | ⚠️ | ✅ |

---

## 🎯 Use Cases

### SSS-1: Minimal Stablecoin

**Perfect for:**
- Internal company tokens
- DAO treasury tokens
- Gaming currencies
- Loyalty points
- Test environments

**Example:**
```bash
sss-token init --preset sss-1 --name "GameCoin" --symbol "GAME"
```

### SSS-2: Compliant Stablecoin

**Perfect for:**
- Regulated stablecoins (USDC-class)
- Bank-issued digital currencies
- Payment processors
- Remittance services
- Institutional DeFi

**Example:**
```bash
sss-token init --preset sss-2 --name "Bank USD" --symbol "BUSD"
```

### SSS-3: Private Stablecoin

**Perfect for:**
- Privacy-focused payments
- Corporate treasury (confidential balances)
- High-net-worth individuals
- Experimental use cases

**Example:**
```bash
sss-token init --preset sss-3 --name "Private USD" --symbol "PUSD"
```

---

## 🛣️ Roadmap

### Phase 1: Core SDK ✅
- [x] SSS-1 implementation
- [x] SSS-2 implementation
- [x] CLI tool
- [x] TypeScript SDK
- [x] Documentation

### Phase 2: Advanced Features (Current)
- [ ] SSS-3 (confidential transfers)
- [ ] Oracle integration module
- [ ] Interactive TUI
- [ ] Example frontend
- [ ] Audit completion

### Phase 3: Ecosystem (Q2 2026)
- [ ] Multi-chain support (Ethereum, Polygon)
- [ ] DeFi integrations (Kamino, MarginFi)
- [ ] Governance module
- [ ] Mobile SDK

### Phase 4: Enterprise (Q3 2026)
- [ ] White-label solution
- [ ] Managed service
- [ ] SLA guarantees
- [ ] 24/7 support

---

## 🤝 Contributing

We welcome contributions! Please see [CONTRIBUTING.md](./CONTRIBUTING.md) for guidelines.

### Development Setup

```bash
# Clone repository
git clone https://github.com/solanabr/solana-stablecoin-standard.git
cd solana-stablecoin-standard

# Install dependencies
npm install

# Build programs
cd programs
anchor build

# Run tests
anchor test

# Build SDK
cd ../sdk
npm run build

# Build CLI
cd ../cli
npm run build
```

---

## 📄 License

MIT License - see [LICENSE](./LICENSE) for details

---

## 🙏 Acknowledgments

Built with ❤️ by Superteam Brazil

Special thanks to:
- Solana Foundation for Token-2022
- Anchor team for the framework
- Circle for USDC reference implementation
- Solana Vault Standard for inspiration

---

## 📞 Contact

- **GitHub**: [github.com/solanabr/solana-stablecoin-standard](https://github.com/solanabr/solana-stablecoin-standard)
- **Discord**: [discord.gg/superteambrasil](https://discord.gg/superteambrasil)
- **Twitter**: [@SuperteamBR](https://twitter.com/SuperteamBR)
- **Email**: hello@superteam.fun

---

## 🏆 Built for Superteam Brazil

This SDK is part of Superteam Brazil's mission to build open-source standards for Solana. Check out our other projects:

- [Solana Vault Standard (SVS)](https://github.com/solanabr/solana-vault-standard)
- [Solana Stablecoin Standard (SSS)](https://github.com/solanabr/solana-stablecoin-standard)

---

**Ready to build your stablecoin?**

```bash
npx @stbr/sss-token init --preset sss-2
```
