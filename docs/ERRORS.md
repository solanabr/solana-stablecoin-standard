# Error Reference

## Error Codes

| Code | Name | Description | Resolution |
|------|------|-------------|------------|
| 6000 | `Unauthorized` | Caller lacks required role | Verify you have the correct role for this operation |
| 6001 | `Paused` | Program is paused | Wait for unpause or contact pauser |
| 6002 | `InvalidMint` | Mint doesn't match config | Verify correct mint address |
| 6003 | `InvalidTreasury` | Invalid treasury token account | Verify treasury ATA is correct |
| 6004 | `QuotaExceeded` | Minter quota exceeded | Wait for window reset or request quota increase |
| 6005 | `InvalidQuota` | Invalid quota configuration | Ensure quota > 0 and window > 0 |
| 6006 | `MathOverflow` | Arithmetic overflow | Use smaller amounts |
| 6007 | `ComplianceDisabled` | SSS-2 features not enabled | Initialize with SSS-2 preset for compliance features |
| 6008 | `PermanentDelegateDisabled` | Permanent delegate not enabled | Initialize with SSS-2 preset |
| 6009 | `WalletBlacklisted` | Wallet is blacklisted | Contact blacklister for removal |
| 6010 | `WalletNotBlacklisted` | Wallet not blacklisted | Must be blacklisted before seize |
| 6011 | `InvalidComplianceRecord` | Invalid compliance record PDA | Verify compliance record PDA derivation |
| 6012 | `InvalidTokenAccount` | Invalid token account | Ensure token account matches mint |
| 6013 | `MintSizingFailed` | Failed to calculate mint size | Retry with valid parameters |
| 6014 | `InvalidPresetConfiguration` | Preset/extension mismatch | Ensure extensions match preset requirements |

## Error by Operation

### Initialize

| Error | Cause | Fix |
|-------|-------|-----|
| `InvalidPresetConfiguration` | SSS-1 with compliance enabled, or SSS-2 without | Match extensions to preset |
| `InvalidQuota` | Zero quota or window | Use positive values |

### Mint

| Error | Cause | Fix |
|-------|-------|-----|
| `Unauthorized` | Not a minter or minter inactive | Request minter role activation |
| `Paused` | Program is paused | Wait for unpause |
| `QuotaExceeded` | Amount exceeds remaining quota | Mint smaller amount or wait for window |
| `WalletBlacklisted` | Recipient is blacklisted (SSS-2) | Remove from blacklist or use different recipient |

### Burn

| Error | Cause | Fix |
|-------|-------|-----|
| `Unauthorized` | Not token owner and not burner | Use burner role (SSS-2) or burn own tokens |
| `Paused` | Program is paused | Wait for unpause |
| `PermanentDelegateDisabled` | Burning others' tokens requires SSS-2 | Initialize with SSS-2 for delegated burn |

### Freeze/Thaw

| Error | Cause | Fix |
|-------|-------|-----|
| `Unauthorized` | Not pauser or master | Request pauser role |
| `Paused` | Program is paused (freeze only) | Wait for unpause |
| `InvalidTokenAccount` | Token account doesn't match mint | Use correct token account |

### Pause/Unpause

| Error | Cause | Fix |
|-------|-------|-----|
| `Unauthorized` | Not pauser or master | Request pauser role |

### Update Minter

| Error | Cause | Fix |
|-------|-------|-----|
| `Unauthorized` | Not master authority | Use master key |

### Update Roles

| Error | Cause | Fix |
|-------|-------|-----|
| `Unauthorized` | Not master authority | Use master key |

### Transfer Authority

| Error | Cause | Fix |
|-------|-------|-----|
| `Unauthorized` | Not master authority | Use master key |

### Blacklist (SSS-2)

| Error | Cause | Fix |
|-------|-------|-----|
| `Unauthorized` | Not blacklister or master | Request blacklister role |
| `ComplianceDisabled` | SSS-1 doesn't support blacklist | Initialize with SSS-2 |

### Seize (SSS-2)

| Error | Cause | Fix |
|-------|-------|-----|
| `Unauthorized` | Not seizer or master | Request seizer role |
| `ComplianceDisabled` | SSS-1 doesn't support seize | Initialize with SSS-2 |
| `PermanentDelegateDisabled` | Seize requires permanent delegate | Initialize with SSS-2 |
| `WalletNotBlacklisted` | seize_requires_blacklist is true | Blacklist wallet first or use override |
| `InvalidTreasury` | Destination is not configured treasury | Use correct treasury account |

## Common Issues

### Issue: "Unauthorized" when minting

**Cause**: You're not a registered minter or your minter role is inactive.

**Solution**:
1. Check your minter status: Query the minter role PDA
2. If not a minter, request master authority to add you
3. If inactive, request reactivation

```typescript
// Check minter role
const minterRole = SolanaStablecoin.deriveMinterRolePda(config, authority);
const role = await program.account.minterRole.fetch(minterRole);
console.log(role.active, role.quotaAmount, role.mintedInWindow);
```

### Issue: "QuotaExceeded"

**Cause**: You've minted your quota for the current window.

**Solution**:
1. Wait for the window to reset
2. Request quota increase from master authority
3. Use a different minter account

```typescript
// Check window status
const role = await program.account.minterRole.fetch(minterRolePda);
const now = Math.floor(Date.now() / 1000);
const windowEnd = role.windowStartTs + role.windowSeconds;
console.log(`Window resets at: ${new Date(windowEnd * 1000)}`);
```

### Issue: "ComplianceDisabled" in SSS-2

**Cause**: Program initialized without compliance extensions.

**Solution**: Ensure you initialize with:
```typescript
preset: Presets.SSS_2 // Not SSS_1
// Or explicitly:
extensions: {
  enableCompliance: true,
  enablePermanentDelegate: true,
  enableTransferHook: true,
}
```

### Issue: Transfer fails in SSS-2

**Cause**: Source or destination is blacklisted.

**Solution**:
1. Check blacklist status
2. Contact blacklister for removal if false positive

```typescript
const recordPda = SolanaStablecoin.deriveComplianceRecordPda(mint, wallet);
const record = await program.account.complianceRecord.fetch(recordPda);
console.log(record.blacklisted);
```

## SDK Error Handling

```typescript
try {
  await sss.mint({ authority, recipientTokenAccount, amount });
} catch (error) {
  if (error.message.includes('QuotaExceeded')) {
    console.log('Quota exceeded, try smaller amount');
  } else if (error.message.includes('Unauthorized')) {
    console.log('Not authorized to mint');
  } else if (error.message.includes('Paused')) {
    console.log('Program is paused');
  }
}
```

## Program Logs

To debug errors, check program logs:

```bash
# With Solana CLI
solana logs | grep "Program log:"

# In tests
console.log(txResult.meta.logMessages);
```

Look for:
- "Instruction: [name]" - Which instruction was called
- "Program log: Error: [message]" - Error details
- "Program log: [event data]" - Events emitted
