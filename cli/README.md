# Solana Stablecoin Standard CLI

User-friendly command-line tool for managing stablecoins on Solana.

## 🚀 Quick Start

```bash
# Get devnet SOL
solana airdrop 2 --url devnet

# Create a stablecoin
node dist/index.js init -n "My USD" -s "MUSD"

# Mint tokens
node dist/index.js mint 1000

# Or use interactive mode
node dist/index.js interactive
```

## 📦 Installation

### Local Usage
```bash
cd cli
npm install
npm run build
node dist/index.js <command>
```

### Global Installation
```bash
cd cli
npm link
sss <command>  # Now available globally!
```

## 📖 Commands

### Interactive Mode (Easiest)
```bash
node dist/index.js interactive
```
Beautiful UI with menus and prompts.

### Command Line (Fastest)

**Initialize:**
```bash
node dist/index.js init -n "Token Name" -s "SYMBOL"
```

**Mint:**
```bash
node dist/index.js mint 1000
```

**Burn:**
```bash
node dist/index.js burn 500
```

**Pause/Unpause:**
```bash
node dist/index.js pause
node dist/index.js unpause
```

**Freeze/Thaw:**
```bash
node dist/index.js freeze <address>
node dist/index.js thaw <address>
```

**Blacklist:**
```bash
node dist/index.js blacklist add <address> -r "Reason"
node dist/index.js blacklist remove <address>
```

**Status:**
```bash
node dist/index.js status
```

## 🌐 Options

```bash
-c, --cluster <cluster>    # devnet, testnet, mainnet-beta (default: devnet)
-k, --keypair <path>       # Path to keypair (default: ~/.config/solana/id.json)
```

## 📝 Examples

```bash
# Create on testnet
node dist/index.js init -n "Test USD" -s "TUSD" --cluster testnet

# Mint with custom keypair
node dist/index.js mint 1000 --keypair ~/my-key.json

# Check status
node dist/index.js status
```

## ✨ Features

- ✅ Real on-chain transactions
- ✅ Solana Explorer links
- ✅ Interactive UI mode
- ✅ Command-line mode
- ✅ Config file support
- ✅ Multiple cluster support

## 🔗 Links

- [Full CLI Guide](../CLI_GUIDE.md)
- [Quick Start](../QUICKSTART.md)
- [Implementation Details](../IMPLEMENTATION_COMPLETE.md)

## 💡 Tips

1. **Use Interactive Mode** if you're new - it guides you through everything
2. **Save the config** - After `init`, a `.sss-config.json` is created
3. **Check Explorer** - Every command gives you a link to verify on-chain
4. **Get help** - Run `node dist/index.js --help` anytime

## 🎯 Real Transactions

This CLI makes **real transactions** on Solana:
- Programs deployed to devnet
- Every operation is verifiable on Explorer
- Actual on-chain state changes

Not a simulation - this is production-ready infrastructure!
