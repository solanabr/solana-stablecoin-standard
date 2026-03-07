# 🚀 Quick Start Guide - Real Transactions

## Your Solana Stablecoin Standard is Now Live!

Both programs are deployed to devnet and the CLI makes **real on-chain transactions**.

---

## ⚡ Quick Start (5 minutes)

### Step 1: Get Devnet SOL

```bash
solana config set --url devnet
solana airdrop 2
solana balance
```

### Step 2: Run the Interactive CLI

```bash
cd solana-stablecoin-standard/cli
node dist/interactive.js
```

### Step 3: Create Your First Stablecoin

1. Select **"🚀 Initialize New Stablecoin"**
2. Choose **SSS-1** (minimal) or **SSS-2** (compliant)
3. Enter details:
   - Name: `My USD`
   - Symbol: `MUSD`
   - Decimals: `6`
   - Cluster: `devnet`
4. Wait for transaction confirmation
5. **Copy the mint address and transaction signature!**

### Step 4: Verify on Solana Explorer

Click the Explorer link in the CLI output or visit:
```
https://explorer.solana.com/address/<YOUR_MINT_ADDRESS>?cluster=devnet
```

---

## 🎯 What You Can Do

All operations create real transactions on Solana devnet:

- 🚀 **Initialize** - Create new stablecoin
- 💰 **Mint** - Mint tokens
- 🔥 **Burn** - Burn tokens
- ❄️ **Freeze** - Freeze accounts
- 🔓 **Thaw** - Unfreeze accounts
- ⛔ **Pause** - Pause all operations
- ▶️ **Unpause** - Resume operations
- 🚫 **Blacklist** - Manage blacklist
- 📊 **Status** - View on-chain state
- 💵 **Supply** - View supply info

**Every operation is verifiable on Solana Explorer!**

---

## 🎉 Success!

You now have **fully functional stablecoin infrastructure** on Solana:

✅ Real programs deployed to devnet
✅ Real transactions with on-chain verification
✅ Interactive CLI for easy management
✅ Production-ready SDK for integration
✅ Compliance features (freeze, pause, blacklist)

**This is real infrastructure that contributes to the Solana ecosystem!** 🌟
