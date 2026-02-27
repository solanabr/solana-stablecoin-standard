# @stbr/sss-token

Solana Stablecoin Standards (SSS) SDK for Token-2022 with transfer hooks.

## Installation

```bash
npm install @stbr/sss-token
# or
yarn add @stbr/sss-token
```

## Quick Start

### SSS-2 Transfer Hook (Fees, Whitelist, Blacklist)

```typescript
import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import { SSS2Hook, BN } from '@stbr/sss-token';

// Setup
const connection = new Connection('https://api.devnet.solana.com', 'confirmed');
const payer = Keypair.generate(); // Use your wallet keypair

const hook = new SSS2Hook(connection, payer);

// Initialize with 1% fee, max 1 SOL fee
await hook.initialize({
  transferFeeBasisPoints: 100,  // 1%
  maxTransferFee: new BN(1000000000), // 1 SOL
  minTransferAmount: new BN(1000),
  blacklistEnabled: true,
});

// Add address to whitelist (no fees)
const someAddress = new PublicKey('xxx...');
await hook.addWhitelist(someAddress);

// Add address to blacklist (blocked from transfers)
const badActor = new PublicKey('yyy...');
await hook.addBlacklist(badActor);

// Enable/disable blacklist enforcement
await hook.setBlacklistEnabled(true);

// Set permanent delegate (bypasses all restrictions)
await hook.setPermanentDelegate(delegatePublicKey);

// Pause/unpause hook
await hook.setPaused(true);
await hook.setPaused(false);

// Calculate fee for a transfer
const feeCalc = hook.calculateFee(new BN(1000000000), {
  transferFeeBasisPoints: 100,
  maxTransferFee: new BN(1000000000),
});
console.log(`Fee: ${feeCalc.fee.toString()}`);
console.log(`Net: ${feeCalc.netAmount.toString()}`);
```

## Presets

| Preset | Description |
|--------|-------------|
| `Presets.SSS_1` | Basic RBAC stablecoin |
| `Presets.SSS_2` | Transfer hook with fees, whitelist, blacklist |
| `Presets.SSS_3` | Advanced governance (coming soon) |

## Program IDs

| Network | Program ID |
|---------|------------|
| Devnet | `FSkkSmrThcLpU9Uybrn4xcpbQKswUJn7KvoUQBsLPExD` |
| Mainnet | TBD |

## API Reference

### SSS2Hook

```typescript
class SSS2Hook {
  constructor(connection: Connection, payer: Keypair, programId?: PublicKey);

  // Fee management
  initialize(config: SSS2HookConfig): Promise<SDKResult>;
  updateFeeConfig(config: UpdateConfigOptions): Promise<SDKResult>;

  // Whitelist management
  addWhitelist(address: PublicKey): Promise<SDKResult>;
  removeWhitelist(address: PublicKey): Promise<SDKResult>;

  // Blacklist enforcement
  addBlacklist(address: PublicKey): Promise<SDKResult>;
  removeBlacklist(address: PublicKey): Promise<SDKResult>;
  setBlacklistEnabled(enabled: boolean): Promise<SDKResult>;

  // Permanent delegate
  setPermanentDelegate(delegate?: PublicKey): Promise<SDKResult>;

  // Emergency control
  setPaused(paused: boolean): Promise<SDKResult>;

  // Fee calculation
  calculateFee(amount: BN, config: SSS2HookConfig): FeeCalculation;

  // PDAs
  getConfigPDA(): PublicKey;
  getWhitelistPDA(address: PublicKey): PublicKey;
  getBlacklistPDA(address: PublicKey): PublicKey;
}
```

## Dependencies

- `@solana/web3.js`
- `@coral-xyz/anchor`
- `bn.js`

## Testing on Devnet

```bash
npm test
```

## Building

```bash
npm run build
```

## License

MIT

## Support

- Issues: [GitHub Issues](https://github.com/your-repo/sss-token/issues)
- [GitHub Repo](https://github.com/your-repo/sss-token)
