# SSS-1: Minimal Stablecoin Specification

**Version:** 0.1.0  
**Status:** Draft  
**Last Updated:** 2026-03-07

---

## 📋 Overview

SSS-1 é o padrão minimal para stablecoins em Solana. Fornece funcionalidades básicas de mint/burn com controles de emergência, sem compliance on-chain complexo.

---

## 🎯 Use Cases

**Ideal para:**
- Stablecoins internas de protocolos
- DAO treasuries
- Settlement tokens em ecossistemas fechados
- Protótipos e MVPs
- Tokens de teste

**NÃO recomendado para:**
- Stablecoins reguladas (USDC, USDT-class)
- Tokens que requerem compliance on-chain
- Stablecoins com requisitos de blacklist

---

## 🏗️ Architecture

### Token-2022 Extensions

| Extension | Habilitada | Motivo |
|-----------|------------|--------|
| Mint Authority | ✅ | Controle de quem pode mintar |
| Freeze Authority | ✅ | Controle de emergência |
| Token Metadata | ✅ | Nome, símbolo, URI, decimals |
| Permanent Delegate | ❌ | Não necessário para SSS-1 |
| Transfer Hook | ❌ | Não necessário para SSS-1 |
| Confidential Transfer | ❌ | Fora de escopo |

---

## 📦 Instructions

### Initialize

Cria nova stablecoin SSS-1.

```rust
pub fn initialize(ctx: Context<Initialize>, config: StablecoinConfig) -> Result<()>
```

**Accounts:**
- `authority` (Signer) - Admin authority
- `stablecoin` (PDA) - Stablecoin state account
- `mint` (Token-2022 Mint) - Token mint
- `token_program` - Token-2022 program
- `system_program` - System program

**Config:**
```typescript
{
  name: string,        // Ex: "My Stable"
  symbol: string,      // Ex: "MUSD"
  uri: string,         // Metadata URI
  decimals: u8,        // Ex: 6
  enablePermanentDelegate: false,  // Sempre false para SSS-1
  enableTransferHook: false,       // Sempre false para SSS-1
  defaultAccountFrozen: false,
}
```

---

### Mint

Minta tokens para recipient.

```rust
pub fn mint(ctx: Context<Mint>, amount: u64) -> Result<()>
```

**Accounts:**
- `stablecoin` - Stablecoin state
- `minter` (Signer) - Minter authority
- `authority` - Stablecoin authority
- `mint` - Token mint
- `to` - Recipient ATA
- `token_program` - Token-2022 program

**Checks:**
- `amount > 0`
- `!stablecoin.paused`

---

### Burn

Burn tokens do usuário.

```rust
pub fn burn(ctx: Context<Burn>, amount: u64) -> Result<()>
```

**Accounts:**
- `stablecoin` - Stablecoin state
- `authority` (Signer) - Token owner
- `mint` - Token mint
- `from` - User ATA
- `token_program` - Token-2022 program

**Checks:**
- `amount > 0`
- `!stablecoin.paused`

---

### Freeze Account

Congela conta específica (emergency).

```rust
pub fn freeze_account(ctx: Context<FreezeAccount>) -> Result<()>
```

**Accounts:**
- `stablecoin` - Stablecoin state
- `authority` (Signer) - Freeze authority
- `mint` - Token mint
- `account` - Account to freeze
- `token_program` - Token-2022 program

---

### Thaw Account

Descongela conta congelada.

```rust
pub fn thaw_account(ctx: Context<ThawAccount>) -> Result<()>
```

---

### Pause

Para todas as operações (emergency).

```rust
pub fn pause(ctx: Context<Pause>) -> Result<()>
```

**Efeito:** Todas as instruções falham com `VaultPaused` exceto `unpause`.

---

### Unpause

Retoma operações.

```rust
pub fn unpause(ctx: Context<Unpause>) -> Result<()>
```

---

### Transfer Authority

Transfere controle da stablecoin.

```rust
pub fn transfer_authority(ctx: Context<TransferAuthority>, new_authority: Pubkey) -> Result<()>
```

---

## 🔒 Security Model

### Inflation Attack Protection

- Virtual offset mechanism previne donation attacks
- Rounding favorece o vault

### Emergency Controls

- `pause()` - Para tudo
- `freeze_account()` - Congela conta específica

### Role-Based Access Control

| Role | Permissões |
|------|------------|
| **Authority** | Freeze, thaw, pause, unpause, transfer_authority |
| **Minter** | Mint tokens |
| **Token Holder** | Burn, transfer |

---

## 📊 Events

| Event | Fields | Description |
|-------|--------|-------------|
| `MintEvent` | `amount`, `to` | Tokens minted |
| `BurnEvent` | `amount`, `from` | Tokens burned |
| `FreezeEvent` | `account` | Account frozen |
| `ThawEvent` | `account` | Account thawed |
| `PauseEvent` | `paused` | Vault paused/unpaused |
| `AuthorityTransferEvent` | `old_authority`, `new_authority` | Authority transferred |

---

## 🧪 Testing

### Unit Tests

- `tests/sss-1.ts` - 18 test cases
- Coverage: Initialize, mint, burn, freeze, thaw, pause, unpause

### Run Tests

```bash
anchor test -- --grep "SSS-1"
```

---

## 📝 Example Usage

### TypeScript SDK

```typescript
import { SolanaStablecoin, Presets } from "@stbr/sss-token";

// Create SSS-1 stablecoin
const stable = await SolanaStablecoin.create(connection, wallet, {
  preset: Presets.SSS_1,
  name: "My Stable",
  symbol: "MUSD",
  uri: "https://example.com/metadata.json",
  decimals: 6,
});

// Mint
await stable.mint({ recipient, amount: new BN(1000 * 1e6) });

// Burn
await stable.burn({ amount: new BN(500 * 1e6) });

// Emergency freeze
await stable.freezeAccount(suspiciousAccount);

// Pause everything
await stable.pause();
```

---

## 🚀 Deployment

### Devnet

```bash
anchor deploy --provider.cluster devnet
```

### Mainnet

```bash
# ⚠️ AUDIT FIRST!
anchor deploy --provider.cluster mainnet
```

---

## 📞 References

- [Solana Stablecoin Standard README](../README.md)
- [Architecture](ARCHITECTURE.md)
- [Operations Guide](OPERATIONS.md)

---

**License:** MIT
