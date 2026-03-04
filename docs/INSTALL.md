# Installation Guide

## Prerequisites

- Node.js 18+ and npm
- Rust 1.75+
- Solana CLI 1.18+
- Anchor 0.32+

## Quick Install

### 1. Install Solana CLI

```bash
sh -c "$(curl -sSfL https://release.solana.com/stable/install)"
```

### 2. Install Rust

```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
```

### 3. Install Anchor

```bash
cargo install --git https://github.com/coral-xyz/anchor avm --locked --force
avm install 0.32.1
avm use 0.32.1
```

### 4. Install SDK

```bash
npm install @stbr/sss-token
```

### 5. Install CLI

```bash
npm install -g @stbr/sss-token-cli
```

## Verify Installation

```bash
solana --version
anchor --version
sss-token --version
```

## Development Setup

```bash
# Clone repository
git clone https://github.com/solanabr/solana-stablecoin-standard.git
cd solana-stablecoin-standard

# Install dependencies
npm install

# Build programs
anchor build

# Run tests
anchor test
```

## Configuration

```bash
# Set Solana cluster
solana config set --url devnet

# Generate keypair (if needed)
solana-keygen new

# Get devnet SOL
solana airdrop 2
```

## Troubleshooting

### Rust Edition 2024 Error

If you see "edition2024 is required" error:

```bash
rustup update stable
rustup default stable
cargo --version  # Should be 1.93+
```

### Anchor Version Mismatch

```bash
avm use 0.32.1
anchor --version
```

### Node Module Issues

```bash
rm -rf node_modules package-lock.json
npm install
```
