# Solana Stablecoin Standard (SSS)

Modular SDK e padrões para stablecoins em Solana. Um toolkit configurável onde emissores escolhem quais extensões Token-2022 e módulos de compliance habilitar.

**Inspiração:** OpenZeppelin para stablecoins Solana — a biblioteca é o SDK, os contratos (SSS-1, SSS-2) são os padrões.

---

## 🏗️ Arquitetura

Três camadas:

### Layer 1 — Base SDK
- Token creation com mint authority + freeze authority + metadata
- Issuers escolhem quais extensions habilitar
- Role management program
- CLI + TypeScript SDK

### Layer 2 — Modules
- **Compliance module:** transfer hook, blacklist PDAs, permanent delegate
- **Privacy module:** confidential transfers, allowlists
- Cada módulo é independentemente testável e opcional

### Layer 3 — Standard Presets
Combinações opinionated de Layer 1 + Layer 2:

| Standard | Nome | Descrição |
|----------|------|-----------|
| **SSS-1** | Minimal Stablecoin | Mint + freeze + metadata. Nada mais. |
| **SSS-2** | Compliant Stablecoin | SSS-1 + permanent delegate + transfer hook + blacklist |

---

## 📦 Instalação

```bash
# Core SDK (SSS-1/SSS-2)
npm install @stbr/sss-token

# CLI Global
npm install -g @stbr/sss-token
```

---

## 🚀 Quick Start

### TypeScript SDK

```typescript
import { SolanaStablecoin, Presets } from "@stbr/sss-token";
import { BN } from "@coral-xyz/anchor";

// Preset initialization
const stable = await SolanaStablecoin.create(connection, {
  preset: Presets.SSS_2,
  name: "My Stablecoin",
  symbol: "MYUSD",
  decimals: 6,
  authority: adminKeypair,
});

// Or custom config
const custom = await SolanaStablecoin.create(connection, {
  name: "Custom Stable",
  symbol: "CUSD",
  extensions: {
    permanentDelegate: true,
    transferHook: false,
  },
});

// Operations
await stable.mint({ recipient, amount: 1_000_000, minter });
await stable.compliance.blacklistAdd(address, "Sanctions match"); // SSS-2
await stable.compliance.seize(frozenAccount, treasury); // SSS-2

const supply = await stable.getTotalSupply();
```

### CLI

```bash
# Initialize config
sss-token config init

# Add stablecoin alias
sss-token config add my-stable <MINT_ADDRESS> --preset sss-2

# Common operations
sss-token info my-stable          # View vault state
sss-token balance my-stable       # Check your balance
sss-token mint my-stable <recipient> <amount>
sss-token burn my-stable <amount>
sss-token freeze my-stable <address>
sss-token thaw my-stable <address>
sss-token pause / unpause
sss-token status / supply

# SSS-2 compliance
sss-token blacklist add <address> --reason "OFAC match"
sss-token blacklist remove <address>
sss-token seize <address> --to <treasury>

# Management
sss-token minters list / add / remove
sss-token holders [--min-balance <amount>]
sss-token audit-log [--action <type>]
```

---

## 🎯 Padrões

### SSS-1: Minimal Stablecoin

**Para:** Stablecoins simples, tokens internos, DAO treasuries, ecosystem settlement

**Features:**
- ✅ Mint authority
- ✅ Freeze authority
- ✅ Token metadata
- ❌ Transfer hook
- ❌ Blacklist
- ❌ Permanent delegate

**Compliance:** Reativo (freeze accounts conforme necessário)

---

### SSS-2: Compliant Stablecoin

**Para:** Stablecoins reguladas (USDC/USDT-class) onde reguladores esperam enforcement on-chain de blacklist e token seizure

**Features:**
- ✅ Tudo do SSS-1
- ✅ Permanent delegate
- ✅ Transfer hook
- ✅ Blacklist enforcement
- ✅ Compliance module

**Compliance:** Proativo (transfer hook checa cada transação contra blacklist)

---

## 📁 Estrutura do Projeto

```
solana-stablecoin-standard/
├── programs/
│   └── stablecoin/          # Anchor program (SSS-1 + SSS-2)
├── sdk/
│   ├── typescript/          # @stbr/sss-token
│   └── cli/                 # sss-token CLI
├── tests/
│   ├── sss-1.ts             # SSS-1 tests
│   ├── sss-2.ts             # SSS-2 tests
│   └── integration/         # Integration tests
├── docs/
│   ├── ARCHITECTURE.md
│   ├── SDK.md
│   ├── OPERATIONS.md
│   ├── SSS-1.md
│   ├── SSS-2.md
│   └── COMPLIANCE.md
├── Anchor.toml
├── Cargo.toml
├── package.json
└── README.md
```

---

## 🛠️ Installation Guide

### Option 1: Docker (Recommended - No Setup)

```bash
# Start local validator + dev environment
docker compose up -d

# Enter container
docker compose exec anchor bash

# Build & test (inside container)
anchor build
anchor test
```

### Option 2: Local Install (Full Development)

**Step 1: Install Rust**

Windows (Chocolatey):
```powershell
choco install rust
```

Linux/macOS:
```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
source ~/.bashrc  # or ~/.zshrc
```

**Step 2: Install Solana CLI**

Windows:
```powershell
# Download from: https://github.com/anza-xyz/agave/releases
# Or use Chocolatey:
choco install solana-cli
```

Linux/macOS:
```bash
sh -c "$(curl -sSfL https://release.anza.xyz/stable/install)"
source ~/.bashrc
```

**Step 3: Install Anchor CLI**

```bash
cargo install --git https://github.com/coral-xyz/anchor avm --force
avm install 0.30.1
avm use 0.30.1
```

**Step 4: Install Node.js Dependencies**

```bash
npm install
```

**Verify Installation:**

```bash
solana --version    # v2.1.x
anchor --version    # v0.30.1
node --version      # v18+
```

---

## 🔒 Security

### Role-Based Access Control

| Role | Permissões |
|------|------------|
| **Master Authority** | Transferir authorities, update roles |
| **Minter** | Mint tokens (com quota por minter) |
| **Burner** | Burn tokens |
| **Blacklister** (SSS-2) | Add/remove da blacklist |
| **Pauser** | Pause/unpause vault |
| **Seizer** (SSS-2) | Seize tokens via permanent delegate |

**Princípio:** Nenhuma chave controla tudo sozinha.

---

## 🧪 Testing

```bash
# Build all programs
anchor build

# Run all tests
anchor test

# Run SSS-1 tests only
anchor test -- --grep "sss-1"

# Run SSS-2 tests only
anchor test -- --grep "sss-2"

# Run SDK tests
cd sdk/typescript && npm test
```

---

## 📊 Evaluation Criteria (Superteam Bounty)

| Criteria | Weight |
|----------|--------|
| SDK Design & Modularity | 20% |
| Completeness | 20% |
| Code Quality | 20% |
| Security | 15% |
| Authority (credentials) | 20% |
| Usability & Documentation | 5% |
| Bonus Features | Up to 50% |

---

## 🏆 Bounty Submission

**Submit PRs para:** `github.com/solanabr/solana-stablecoin-standard`

**Cada PR deve incluir:**
- ✅ All source code
- ✅ Working tests
- ✅ Devnet deployment proof (Program ID + example transactions)
- ✅ Documentation
- ✅ Docker setup (`docker compose up`)
- ✅ Video (2-5 min) no X explicando a implementação + tag @SuperteamBR

**Deadline:** 21 dias do listing (March 14, 2026 - 2:59 AM UTC)

---

## 📞 Contact

- **GitHub:** Open issue ou tag @kauenet no PR
- **Discord:** `discord.gg/superteambrasil`
- **Twitter:** `@SuperteamBR` | `@kauenet`

---

## 📄 License

MIT

---

**Referência:** [Solana Vault Standard](https://github.com/solanabr/solana-vault-standard)

**Construído para:** Superteam Brazil Bounty - $5,000 USDG
