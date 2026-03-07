# SSS-2: Compliant Stablecoin Specification

**Version:** 0.1.0  
**Status:** Draft  
**Last Updated:** 2026-03-07

---

## 📋 Overview

SSS-2 é o padrão para stablecoins reguladas em Solana. Inclui todos os recursos do SSS-1 + compliance on-chain (blacklist, seizure via permanent delegate).

---

## 🎯 Use Cases

**Ideal para:**
- Stablecoins reguladas (USDC, USDT-class)
- Tokens que requerem compliance on-chain
- Emissão por instituições financeiras
- Tokens sujeitos a sanções (OFAC)

**NÃO recomendado para:**
- Stablecoins descentralizadas
- Tokens de privacidade
- Projetos que valorizam censorships-resistance

---

## 🏗️ Architecture

### Token-2022 Extensions

| Extension | Habilitada | Motivo |
|-----------|------------|--------|
| Mint Authority | ✅ | Controle de mint |
| Freeze Authority | ✅ | Controle de emergência |
| Token Metadata | ✅ | Nome, símbolo, URI |
| **Permanent Delegate** | ✅ | **Seizure de tokens** |
| **Transfer Hook** | ✅ | **Compliance checks** |
| Confidential Transfer | ❌ | Fora de escopo |

---

## 📦 Instructions

### All SSS-1 Instructions +

SSS-2 inclui todas as instruções do SSS-1:
- `initialize`
- `mint`
- `burn`
- `freeze_account`
- `thaw_account`
- `pause` / `unpause`
- `transfer_authority`

### SSS-2 Exclusive Instructions

---

### Add to Blacklist

Adiciona endereço à blacklist.

```rust
pub fn add_to_blacklist(ctx: Context<Compliance>, address: Pubkey) -> Result<()>
```

**Accounts:**
- `stablecoin` - Stablecoin state
- `authority` (Signer) - Compliance authority
- `blacklist` (PDA) - Blacklist account
- `system_program` - System program

**Checks:**
- `stablecoin.config.enable_transfer_hook == true`

---

### Remove from Blacklist

Remove endereço da blacklist.

```rust
pub fn remove_from_blacklist(ctx: Context<Compliance>, address: Pubkey) -> Result<()>
```

---

### Seize

Seize tokens de conta congelada (via permanent delegate).

```rust
pub fn seize(ctx: Context<Seize>, amount: u64, to: Pubkey) -> Result<()>
```

**Accounts:**
- `stablecoin` - Stablecoin state
- `authority` (Signer) - Seize authority
- `mint` - Token mint
- `from` - Source account (must be frozen)
- `to` - Destination account (treasury)
- `token_program` - Token-2022 program

**Checks:**
- `stablecoin.config.enable_permanent_delegate == true`
- `!stablecoin.paused`
- `from` account must be frozen

**Use cases:**
- Sanctions enforcement (OFAC)
- Court orders
- Fraud recovery
- Regulatory compliance

---

## 🔒 Compliance Model

### Blacklist

**PDAs:**
```typescript
const [blacklistPda] = PublicKey.findProgramAddressSync(
  [Buffer.from("blacklist"), stablecoinPda.toBuffer()],
  program.programId
);
```

**Estrutura:**
```rust
pub struct Blacklist {
    pub stablecoin: Pubkey,
    pub blacklisted_addresses: Vec<Pubkey>,
    pub bump: u8,
}
```

**Transfer Hook (futuro):**
- Checa blacklist antes de cada transferência
- Rejeita se sender ou receiver na blacklist

---

### Permanent Delegate

**O que é:**
- Token-2022 extension que permite transferir tokens de QUALQUER conta
- Usado apenas para seizure regulatório

**Quando usar:**
- Ordem judicial
- Sanções OFAC
- Fraude comprovada

**Processo:**
1. Freeze account
2. Adicionar à blacklist
3. Seize tokens
4. Transferir para treasury governamental

---

## 📊 Events (SSS-2 Exclusive)

| Event | Fields | Description |
|-------|--------|-------------|
| `BlacklistAddEvent` | `address` | Address added to blacklist |
| `BlacklistRemoveEvent` | `address` | Address removed from blacklist |
| `SeizeEvent` | `from`, `to`, `amount` | Tokens seized |

---

## 🔐 Security Model

### Enhanced Controls

| Feature | SSS-1 | SSS-2 |
|---------|-------|-------|
| Mint/Burn | ✅ | ✅ |
| Freeze/Thaw | ✅ | ✅ |
| Pause/Unpause | ✅ | ✅ |
| **Blacklist** | ❌ | ✅ |
| **Seize** | ❌ | ✅ |
| **Transfer Hook** | ❌ | ✅ |

### Role-Based Access Control

| Role | Permissões |
|------|------------|
| **Master Authority** | Transfer authority, update roles |
| **Minter** | Mint tokens |
| **Compliance Officer** | Blacklist add/remove, seize |
| **Pauser** | Pause/unpause |

---

## 📝 Example Usage

### TypeScript SDK

```typescript
import { SolanaStablecoin, Presets } from "@stbr/sss-token";

// Create SSS-2 stablecoin
const stable = await SolanaStablecoin.create(connection, wallet, {
  preset: Presets.SSS_2,
  name: "Regulated Stable",
  symbol: "RUSD",
  uri: "https://example.com/compliant-metadata.json",
  decimals: 6,
});

// Mint
await stable.mint({ recipient, amount: new BN(1000 * 1e6) });

// Compliance: Add to blacklist
await stable.blacklistAdd(sanctionedAddress, "OFAC SDN List");

// Compliance: Freeze account
await stable.freezeAccount(sanctionedAddress);

// Compliance: Seize tokens
await stable.seize(
  sanctionedAccount,
  treasuryAccount,
  new BN(5000 * 1e6)
);

// Compliance: Remove from blacklist (if delisted)
await stable.blacklistRemove(address);
```

---

## 🧪 Testing

### Unit Tests

- `tests/sss-2.ts` - 18 test cases
- Coverage: Blacklist add/remove, freeze, seize, compliance checks

### Run Tests

```bash
anchor test -- --grep "SSS-2"
```

---

## 📊 Audit Trail

### Event Logging

Todos os eventos de compliance são emitidos on-chain:

```typescript
// Blacklist operations
program.account.blacklist.fetch(blacklistPda);

// Parse events from transactions
const seizeEvents = await connection.getParsedTransactions([...], {
  commitment: "confirmed",
});
```

### Export for Compliance

```bash
# Export audit log
sss-token audit-log my-stable --action seize --format csv

# Export blacklist history
sss-token blacklist history my-stable --output blacklist.csv
```

---

## 🏛️ Regulatory Considerations

### OFAC Compliance

SSS-2 permite compliance com sanções OFAC:

1. **Identify** - Receber lista SDN (Specially Designated Nationals)
2. **Freeze** - Congelar contas na lista
3. **Blacklist** - Adicionar à blacklist on-chain
4. **Seize** - Transferir tokens para treasury
5. **Report** - Exportar audit trail para regulators

### MiCA (EU)

Requisitos MiCA atendidos:

- ✅ Reserve transparency (on-chain supply)
- ✅ Redemption mechanism (burn)
- ✅ Emergency controls (pause, freeze)
- ✅ AML/CFT measures (blacklist, seize)

### Travel Rule

- Endereços on-chain são pseudônimos
- Off-chain KYC necessário para emissor
- Blacklist permite enforcement

---

## 🚀 Deployment

### Devnet

```bash
# Deploy
anchor deploy --provider.cluster devnet

# Initialize SSS-2
sss-token init --preset sss-2 --name "Compliant Stable" --symbol "CUSD"
```

### Mainnet

```bash
# ⚠️ AUDIT FIRST!
# Legal review necessário
# Regulatory approval pode ser necessário

anchor deploy --provider.cluster mainnet
```

---

## 📞 References

- [Solana Stablecoin Standard README](../README.md)
- [Architecture](ARCHITECTURE.md)
- [Operations Guide](OPERATIONS.md)
- [Compliance Guide](COMPLIANCE.md) (em desenvolvimento)

---

**License:** MIT
