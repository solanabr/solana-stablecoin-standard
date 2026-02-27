# SSS-2 Transfer Hook - Deployment Info

## Program ID
```
FSkkSmrThcLpU9Uybrn4xcpbQKswUJn7KvoUQBsLPExD
```

## Network
- **Devnet**: https://api.devnet.solana.com
- **Status**: ✅ Deployed & Executable
- **Deployed Slot**: 444043874
- **Balance**: 2.09 SOL
- **Data Size**: 300,512 bytes

## Authority
```
FUTbzegEr8jH8T8UMztMv7Wo38931XSkMsuAB9CRW7FS
```

## Features Implemented

### 1. Transfer Hook Core
- ✅ Fee calculation (basis points, max cap)
- ✅ Minimum transfer validation
- ✅ Pause/unpause emergency switch
- ✅ Events for off-chain indexing

### 2. Whitelist Management
- ✅ Add/remove addresses from whitelist
- ✅ Whitelisted transfers bypass fees
- ✅ Rent recovery on removal

### 3. Blacklist Enforcement (NEW)
- ✅ Add addresses to blacklist
- ✅ Block transfers from blacklisted addresses
- ✅ Toggle blacklist on/off
- ✅ Prevents sanctioned actors from transferring

### 4. Permanent Delegate (NEW)
- ✅ Set permanent delegate address
- ✅ Delegate bypasses ALL restrictions (fees, blacklist)
- ✅ Can be cleared/updated by authority

## PDAs
- **Config**: `["config", authority]`
- **Whitelist**: `["whitelist", authority, address]`
- **Blacklist**: `["blacklist", authority, address]`

## Instructions
| Instruction | Description |
|-------------|-------------|
| `initialize` | Setup hook with fee config |
| `executeTransferHook` | Called on every transfer |
| `updateFeeConfig` | Update fee settings |
| `addWhitelist` | Add address to whitelist |
| `removeWhitelist` | Remove address from whitelist |
| `addBlacklist` | Add address to blacklist |
| `removeBlacklist` | Remove address from blacklist |
| `setPermanentDelegate` | Set/clear permanent delegate |
| `setBlacklistEnabled` | Toggle blacklist enforcement |
| `setPaused` | Pause/unpause all transfers |
| `closeConfig` | Close program config |

## Build
```bash
anchor build --skip-lint --no-idl
```

## Deploy
```bash
solana program deploy target/deploy/sss2_hook.so \
  --program-id target/deploy/sss2_hook-keypair.json \
  --url devnet
```

## Next Steps
1. ✅ Deploy to devnet
2. ⏳ Initialize program
3. ⏳ Add test whitelist/blacklist entries
4. ⏳ Test transfer hook execution
5. ⏳ Deploy to mainnet-beta (for production)

## Bounty Requirements Status
| Component | Status |
|-----------|--------|
| Transfer Hook | ✅ Done |
| Fee Collection | ✅ Done |
| Whitelist | ✅ Done |
| Blacklist Enforcement | ✅ Done |
| Permanent Delegate | ✅ Done |
| Staking Vault | ⏸️ Skip (not required) |
| Governance | ⏸️ Skip (not required) |

---
Updated: 2026-02-23
