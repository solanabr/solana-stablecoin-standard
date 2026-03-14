# 🏦 Solana Stablecoin Standard (SSS)

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Framework](https://img.shields.io/badge/framework-Anchor_v0.30.1-purple.svg)
![Standard](https://img.shields.io/badge/standard-Token--2022-14F195.svg)
![Build](https://img.shields.io/badge/build-passing-brightgreen.svg)

> A production-ready, modular SDK and Anchor smart contract framework for issuing stablecoins on Solana. Built for the **Superteam Brazil Bounty**.

---

## 🎥 Video Demonstration
[**▶️ Watch the 3-minute Pitch & Technical Demo on X (Twitter)**](https://x.com/denis5296/status/2032651735156797939)

---

## ✨ Overview

The Solana Stablecoin Standard (SSS) is designed like *OpenZeppelin for Solana*. It provides a configurable toolkit where issuers can seamlessly choose which Token-2022 extensions and compliance modules to enable.

### 🏆 Key Features & Deliverables
- **SSS-1 (Minimal Stablecoin):** Mint authority, freeze authority, and on-chain metadata. No extra bloat.
- **SSS-2 (Compliant Stablecoin):** Full regulatory compliance. Implements **Transfer Hooks** for on-chain Blacklist enforcement and **Permanent Delegates** for lawful fund seizure.
- **Bonus 1 (Interactive TUI):** A "God Mode" Terminal UI dashboard for operators to monitor supply, manage blacklists, and view live logs.
- **Bonus 2 (Docker Infrastructure):** One-click local environment setup with pre-configured validators and a Compliance/Audit REST API backend.
- **Bonus 3 (Oracle Pegs):** Extensible architecture supporting Mock Oracles for Non-USD pegs (e.g., EUR, BRL).
- **Bulletproof Architecture:** Solves the notorious Solana `realloc` and `InvalidAccountData` bugs by utilizing a highly optimized pre-funded account initialization pattern.

---

## 🏗 Architecture (3-Layer Model)

1. **Layer 1 (Base SDK):** Core Token-2022 setup. Handles token creation, role management (RBAC), and basic operations (Mint/Burn/Freeze).
2. **Layer 2 (Modules):** Composable pieces like the `ComplianceModule` (Transfer Hook interceptors, Blacklist PDAs) and `OracleModule`.
3. **Layer 3 (Standard Presets):** Opinionated out-of-the-box configurations (`Presets.SSS_1`, `Presets.SSS_2`).

---

## 🚀 Quick Start (For Judges)

We have containerized the entire infrastructure to make evaluation as smooth as possible.

### 1. Start the Environment
Run the local Solana validator and the Compliance REST API with one command:

```Bash
docker-compose up -d --build
```

### 2. Deploy the Programs
Build and deploy the smart contracts to the local network:

```Bash
anchor build
anchor deploy
```

### 3. Run the Integration Tests
Run the comprehensive test suite that simulates SSS-2 token creation, blacklisting, blocked transfers, and fund seizure:

```Bash
npx tsx scripts/test_basic.ts
```

---

## 💻 TypeScript SDK Experience

We prioritized Developer Experience (DX). Creating a fully compliant, heavily regulated stablecoin now takes exactly one function call.

```Ts
import { StablecoinSDK, Presets } from "@stbr/sss-token";

// 1. Initialize an SSS-2 Compliant Stablecoin
const mintAddress = await sdk.create(
    "Regulated USD", 
    "RUSD", 
    "https://example.com/logo.png", 
    6, 
    Presets.SSS_2, // Automatically enables Hooks & Permanent Delegate
    hookProgramAddress
);

// 2. Add malicious actor to the Blacklist
await sdk.compliance.blacklistAdd(badGuyWallet, hookProgramAddress);

// 3. Forcefully seize funds from the frozen account to the Treasury
await sdk.compliance.seize(mintAddress, badGuyAta, treasuryAta, 1000);
```

---

## 🖥 Admin CLI & TUI (God Mode)

Operators need to execute actions fast. We built a robust CLI and an interactive Terminal UI for real-time management.

### Standard CLI Commands
```Bash
# Initialize a token
sss-token init --name "My USD" --symbol "MUSD" --preset sss-2

# Operations
sss-token mint --mint <ADDRESS> --to <ADDRESS> --amount 1000
sss-token burn --mint <ADDRESS> --from <ADDRESS> --amount 50

# Compliance (SSS-2)
sss-token blacklist add <ADDRESS> --mint <ADDRESS> --reason "OFAC match"
sss-token seize <FROZEN_ADDRESS> --to <TREASURY> --amount 100
```

### 🌟 Interactive TUI Dashboard
Launch the visual terminal interface to monitor your stablecoin live:

```Bash
sss-token dashboard --mint <ADDRESS>
```

---

## 🛡 Security & Testing

- **RBAC:** Strict Role-Based Access Control using PDAs. No single private key controls the entire protocol.
- **Fail Gracefully:** If an SSS-2 command (like `seize`) is called on an SSS-1 token, the SDK and Smart Contract return a custom `FeatureNotEnabled` error instead of panicking.
- **Fuzzing & Coverage:** Audited instruction parameters to prevent replay attacks and inflation. Safe math (`checked_add`/`checked_sub`) is strictly enforced.

---

## 📂 Documentation Directory

Please refer to the `docs/` folder for deep dives into the protocol:
- `ARCHITECTURE.md` — Data flows and module interactions.
- `SSS-1.md` & `SSS-2.md` — Standard specifications.
- `OPERATIONS.md` — Runbook for CLI operators.
- `SECURITY.md` — Threat models and mitigations.

---
Built with 🩵 for the Solana Ecosystem.
