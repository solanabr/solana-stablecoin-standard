# SSS Admin Frontend

A React-based institutional dashboard for managing the Solana Stablecoin Standard. This application leverages the `@stbr/sss-token` SDK to provide a visual interface for compliance officers and treasury managers.

## 🚀 Features

- **Dashboard**: Real-time overview of total supply and system pause state.
- **Role Management**: Visual interface for granting/revoking minter and compliance roles.
- **Compliance Center**: One-click Freeze/Thaw and Blacklist management.
- **Seizure Interface**: Secure workflow for asset recovery from sanctioned accounts.

## 🏗️ Tech Stack

- **Framework**: React 18 + Vite
- **Language**: TypeScript
- **Styling**: Vanilla CSS (Standard Modern UI)
- **Blockchain**: `@solana/web3.js` + `@coral-xyz/anchor`

## 🛠️ Architecture

```mermaid
graph LR
    User[Admin User] -->|Action| UI[React UI]
    UI -->|Invoke| SDK[@stbr/sss-token SDK]
    SDK -->|Transaction| Cluster[Solana Devnet/Mainnet]
    Cluster -->|Events| Indexer[SSS Indexer Service]
    Indexer -->|Update| UI
```

## 📦 Getting Started

### Local Development
```bash
npm install
npm run dev
```

### Environment Variables
Create a `.env` in this directory:
```env
VITE_RPC_URL=http://localhost:8899
VITE_STABLECOIN_PROGRAM_ID=...
```

## 🔒 Security Note
This frontend is intended for use with hardware wallets (Ledger/Solflare). It does not store private keys. All transactions are passed to the wallet adapter for signing.
