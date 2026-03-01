# Standard Presets

## SSS-1: Minimal Stablecoin

### Description
The simplest stablecoin configuration. Provides basic token management with role-based access control.

### Token-2022 Extensions
None required. Uses a standard Token-2022 mint.

### Features
- Mint authority managed by program PDA
- Freeze authority managed by program PDA
- Per-minter quotas
- Global pause/unpause
- Role-based access (master, minter, burner, pauser)

### Use Cases
- DAO treasury tokens
- Community stablecoins
- Simple pegged tokens
- Internal accounting tokens

### Initialization

```typescript
const config = Presets.SSS1({
  name: "MyStablecoin",
  symbol: "MSTB",
  decimals: 6,
});
```

```bash
sss-token init --preset sss-1 --name "MyStablecoin" --symbol "MSTB"
```

---

## SSS-2: Compliant Stablecoin

### Description
A fully compliant stablecoin with regulatory features. Includes blacklist enforcement, token seizure, and transfer monitoring.

### Token-2022 Extensions
- **PermanentDelegate**: Allows the program PDA to transfer tokens from any account (for seizure)
- **TransferHook**: Calls the transfer hook program on every transfer (for blacklist checks)
- **DefaultAccountState**: New token accounts start frozen (requires explicit thawing/KYC)

### Features
Everything in SSS-1, plus:
- Blacklist management with reasons and timestamps
- Transfer blocking for blacklisted addresses (both sender and receiver)
- Token seizure from blacklisted accounts to treasury
- Default-frozen accounts (KYC gate)
- Additional roles: blacklister, seizer

### Use Cases
- Regulated fiat-backed stablecoins
- Institutional tokens
- Compliant payment tokens
- USDC/USDT-class tokens

### Initialization

```typescript
const config = Presets.SSS2({
  name: "RegulatedStable",
  symbol: "RSTB",
  decimals: 6,
});
```

```bash
sss-token init --preset sss-2 --name "RegulatedStable" --symbol "RSTB"
```

### Compliance Workflow

1. **KYC Gate**: New accounts are frozen by default. Issuer thaws after KYC.
2. **Monitoring**: Transfer hook checks blacklist on every transfer.
3. **Blacklisting**: Blacklister adds addresses with reasons (e.g., "OFAC match").
4. **Enforcement**: Blacklisted addresses cannot send or receive tokens.
5. **Seizure**: Seizer can transfer all tokens from blacklisted account to treasury.
6. **Audit Trail**: All actions logged on-chain with timestamps.
