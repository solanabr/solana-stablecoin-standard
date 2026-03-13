# SSS Operator CLI

The primary command-line interface for the Solana Stablecoin Standard. Designed for institutional operators, it supports both hot-wallet execution and offline transaction payload generation for multisig signing.

## 🕹️ Commands

### Initialization
```bash
sss-token init --name "Euro Token" --symbol "EURS" --preset sss-2
```

### Monetary Operations
```bash
sss-token mint <recipient> 50000
sss-token burn <holder> 1000
sss-token quota update <minter> 1000000
```

### Compliance Operations
```bash
sss-token blacklist add <address> --reason "Compliance Review"
sss-token seize <address> <treasury> 1000
sss-token freeze <address>
```

## 🛠️ Offline Mode (Security)

For institutions utilizing cold storage, the CLI can output raw transaction payloads without signing:

```bash
sss-token mint <recipient> 50000 --offline
```
*Outputs a Base64-encoded transaction for signing in an air-gapped environment or via Squads V4.*

## 📊 Interactive TUI

Run the interactive dashboard:
```bash
npm run tui
```

## 🏗️ Structure

```mermaid
graph TD
    CLI[CLI Entry] --> Commands[Command Parsers]
    Commands --> SDK[@stbr/sss-token SDK]
    SDK --> Connection[Solana RPC]
```
